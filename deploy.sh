#!/bin/bash
set -e

# Config
REGION="us-central1"
FIRESTORE_DB_NAME="movie-analytics-db"
FUNCTION_NAME="analytics-processor"
FUNCTION_SOURCE="./event-handler"
FUNCTION_ENTRY_POINT="pubsub_handler"
PUBSUB_TOPIC="movie-events"
PUBSUB_SUBSCRIPTION="movie-events-sub"
GATEWAY_NAME="gateway-service"
GATEWAY_SOURCE="./gateway-service"
SERVICE_NAME="fast-lazy-bee"
SERVICE_SOURCE="./fast-lazy-bee"
FRONTEND_SOURCE="./frontend-app"
ARTIFACT_REPO="myrepo"
IMAGE_TAG="v1"
MONGO_URL=""
PROJECT_ID=$(gcloud config get-value project)

# Full image path in Artifact Registry
GATEWAY_IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/$ARTIFACT_REPO/$GATEWAY_NAME:$IMAGE_TAG"

# Create Artifact Registry repo
gcloud artifacts repositories create $ARTIFACT_REPO \
    --repository-format=docker \
    --location=$REGION || true

# Build and inject React Frontend
echo "Building React Frontend..."
cd $FRONTEND_SOURCE
npm install
npm run build
cd ..

echo "Copying frontend build to Gateway public folder..."
rm -rf "$GATEWAY_SOURCE/public"
mkdir -p "$GATEWAY_SOURCE/public"
cp -R "$FRONTEND_SOURCE/build/"* "$GATEWAY_SOURCE/public/"

# Build and push the gateway image
gcloud builds submit $GATEWAY_SOURCE --tag=$GATEWAY_IMAGE

# Deploy the gateway to Cloud Run
gcloud run deploy $GATEWAY_NAME \
    --image=$GATEWAY_IMAGE \
    --region=$REGION \
    --platform=managed \
    --allow-unauthenticated \
    --port=8080 \
    --set-env-vars="FIRESTORE_DB_NAME=$FIRESTORE_DB_NAME"

# Get the gateway's public URL
GATEWAY_URL=$(gcloud run services describe $GATEWAY_NAME \
    --region=$REGION \
    --format="value(status.url)")
    
# Endpoint to which the function shall send notifications
GATEWAY_URL_NOTIFY="$GATEWAY_URL/events/notify"

# Create Firestore database in Native mode
echo "Creating Firestore database (waiting for any previous deletion to propagate)..."
sleep 10
gcloud firestore databases create \
    --database=$FIRESTORE_DB_NAME \
    --location=$REGION \
    --type=firestore-native || true

# Create Pub/Sub topic
gcloud pubsub topics create $PUBSUB_TOPIC || true

# Deploy the Cloud Function as a public HTTP endpoint
gcloud functions deploy $FUNCTION_NAME \
    --gen2 \
    --runtime=python312 \
    --region=$REGION \
    --source=$FUNCTION_SOURCE \
    --entry-point=$FUNCTION_ENTRY_POINT \
    --trigger-http \
    --allow-unauthenticated \
    --set-env-vars="FIRESTORE_DB_NAME=$FIRESTORE_DB_NAME,GATEWAY_URL=$GATEWAY_URL_NOTIFY"

# Get the HTTPS URL of the deployed function
FUNCTION_URL=$(gcloud functions describe $FUNCTION_NAME \
    --region=$REGION \
    --gen2 \
    --format="value(serviceConfig.uri)")

# Create push subscription that triggers the function
gcloud pubsub subscriptions create $PUBSUB_SUBSCRIPTION \
    --topic=$PUBSUB_TOPIC \
    --push-endpoint=$FUNCTION_URL || true
    
echo "Dashboard is live at: $GATEWAY_URL"
echo "API Top Movies: $GATEWAY_URL/api/analytics/top-movies"

# Build and push the service image
gcloud builds submit $SERVICE_SOURCE --tag=$REGION-docker.pkg.dev/$PROJECT_ID/$ARTIFACT_REPO/$SERVICE_NAME:$IMAGE_TAG

# Deploy the service to Cloud Run
gcloud run deploy $SERVICE_NAME \
    --image=$REGION-docker.pkg.dev/$PROJECT_ID/$ARTIFACT_REPO/$SERVICE_NAME:$IMAGE_TAG \
    --region=$REGION \
    --platform=managed \
    --allow-unauthenticated \
    --port=3000 \
    --set-env-vars="MONGO_URL=$MONGO_URL,NODE_ENV=production,PUBSUB_TOPIC=$PUBSUB_TOPIC" \
    --min-instances 1 \
    --max-instances 1
