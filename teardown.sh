#!/bin/bash

echo "Starting teardown process..."

# Config
REGION="us-central1"
FIRESTORE_DB_NAME="movie-analytics-db"
FUNCTION_NAME="analytics-processor"
PUBSUB_TOPIC="movie-events"
PUBSUB_SUBSCRIPTION="movie-events-sub"
GATEWAY_NAME="gateway-service"
SERVICE_NAME="fast-lazy-bee"
ARTIFACT_REPO="myrepo"

echo "Deleting Pub/Sub subscription..."
gcloud pubsub subscriptions delete $PUBSUB_SUBSCRIPTION --quiet || true

echo "Deleting Pub/Sub topic..."
gcloud pubsub topics delete $PUBSUB_TOPIC --quiet || true

echo "Deleting Cloud Function..."
gcloud functions delete $FUNCTION_NAME \
    --gen2 \
    --region=$REGION \
    --quiet || true

echo "Deleting Cloud Run gateway service..."
gcloud run services delete $GATEWAY_NAME \
    --region=$REGION \
    --quiet || true

echo "Deleting Cloud Run fast-lazy-bee service..."
gcloud run services delete $SERVICE_NAME \
    --region=$REGION \
    --quiet || true

echo "Deleting Artifact Registry repository (and all images inside)..."
gcloud artifacts repositories delete $ARTIFACT_REPO \
    --location=$REGION \
    --quiet || true
    
echo "Deleting the repo for the cloud function..."
gcloud artifacts repositories delete gcf-artifacts \
    --location=$REGION \
    --quiet || true

echo "Deleting Firestore database..."
gcloud firestore databases delete \
    --database=$FIRESTORE_DB_NAME \
    --quiet || true

echo "Teardown complete! All GCP resources have been deleted."
echo "Don't forget to delete/pause your MongoDB Atlas cluster manually if you don't need it anymore."