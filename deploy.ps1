$ErrorActionPreference = "Stop"

# Config
$env:REGION                 = "us-central1"
$env:FIRESTORE_DB_NAME      = "movie-analytics-db"
$env:FUNCTION_NAME          = "analytics-processor"
$env:FUNCTION_SOURCE        = ".\event-handler"
$env:FUNCTION_ENTRY_POINT   = "pubsub_handler"
$env:PUBSUB_TOPIC           = "movie-events"
$env:PUBSUB_SUBSCRIPTION    = "movie-events-sub"
$env:GATEWAY_NAME           = "gateway-service"
$env:GATEWAY_SOURCE         = ".\gateway-service"
$env:SERVICE_NAME			= "fast-lazy-bee"
$env:SERVICE_SOURCE			= ".\fast-lazy-bee"
$env:ARTIFACT_REPO          = "myrepo"
$env:IMAGE_TAG              = "v1"
$env:MONGO_URL				= ""

# Resolve current project
$env:PROJECT_ID = gcloud config get-value project

# Full image path in Artifact Registry
$env:GATEWAY_IMAGE = "$env:REGION-docker.pkg.dev/$env:PROJECT_ID/$env:ARTIFACT_REPO/$env:GATEWAY_NAME`:$env:IMAGE_TAG"

# Create Artifact Registry repo (ignore if already exists)
gcloud artifacts repositories create $env:ARTIFACT_REPO `
    --repository-format=docker `
    --location=$env:REGION

# Build and push the gateway image
gcloud builds submit $env:GATEWAY_SOURCE --tag=$env:GATEWAY_IMAGE

# Deploy the gateway to Cloud Run
gcloud run deploy $env:GATEWAY_NAME `
    --image=$env:GATEWAY_IMAGE `
    --region=$env:REGION `
    --platform=managed `
    --allow-unauthenticated `
    --port=8080 `
	--set-env-vars="FIRESTORE_DB_NAME=$env:FIRESTORE_DB_NAME"	

# Get the gateway's public URL
$env:GATEWAY_URL = gcloud run services describe $env:GATEWAY_NAME `
    --region=$env:REGION `
    --format="value(status.url)"
	
# Endpoint to which the function shall send notifications
$env:GATEWAY_URL_NOTIFY = "$env:GATEWAY_URL/events/notify"

# Create Firestore database in Native mode
gcloud firestore databases create `
    --database=$env:FIRESTORE_DB_NAME `
    --location=$env:REGION `
    --type=firestore-native

# Create Pub/Sub topic
gcloud pubsub topics create $env:PUBSUB_TOPIC

# Deploy the Cloud Function as a public HTTP endpoint
gcloud functions deploy $env:FUNCTION_NAME `
    --gen2 `
    --runtime=python312 `
    --region=$env:REGION `
    --source=$env:FUNCTION_SOURCE `
    --entry-point=$env:FUNCTION_ENTRY_POINT `
    --trigger-http `
    --allow-unauthenticated `
    --set-env-vars="FIRESTORE_DB_NAME=$env:FIRESTORE_DB_NAME,GATEWAY_URL=$env:GATEWAY_URL_NOTIFY"

# Get the HTTPS URL of the deployed function
$env:FUNCTION_URL = gcloud functions describe $env:FUNCTION_NAME `
    --region=$env:REGION `
    --gen2 `
    --format="value(serviceConfig.uri)"

# Create push subscription that triggers the function
gcloud pubsub subscriptions create $env:PUBSUB_SUBSCRIPTION `
    --topic=$env:PUBSUB_TOPIC `
    --push-endpoint=$env:FUNCTION_URL
	
echo "$env:GATEWAY_URL/api/analytics/top-movies"

# Build and push the service image
gcloud builds submit $env:SERVICE_SOURCE --tag=$env:REGION-docker.pkg.dev/$env:PROJECT_ID/$env:ARTIFACT_REPO/${env:SERVICE_NAME}:$env:IMAGE_TAG

# Deploy the service to Cloud Run
# WE ASSUME YOU ALREADY DEPLOYED YOUR MONGODB
gcloud run deploy $env:SERVICE_NAME `
    --image=$env:REGION-docker.pkg.dev/$env:PROJECT_ID/$env:ARTIFACT_REPO/${env:SERVICE_NAME}:$env:IMAGE_TAG `
    --region=$env:REGION `
    --platform=managed `
    --allow-unauthenticated `
    --port=3000 `
	--set-env-vars="MONGO_URL=$env:MONGO_URL,NODE_ENV=production,PUBSUB_TOPIC=$env:PUBSUB_TOPIC" `
	--min-instances 1 `
	--max-instances 1
