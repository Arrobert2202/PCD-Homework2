$ErrorActionPreference = "Continue"  # keep going even if a resource is already gone

# Config (must match deploy.ps1)
$env:REGION                 = "us-central1"
$env:FIRESTORE_DB_NAME      = "movie-analytics-db"
$env:FUNCTION_NAME          = "analytics-processor"
$env:PUBSUB_TOPIC           = "movie-events"
$env:PUBSUB_SUBSCRIPTION    = "movie-events-sub"
$env:GATEWAY_NAME           = "gateway-service"
$env:ARTIFACT_REPO          = "myrepo"

# Delete Pub/Sub subscription
gcloud pubsub subscriptions delete $env:PUBSUB_SUBSCRIPTION --quiet

# Delete Pub/Sub topic
gcloud pubsub topics delete $env:PUBSUB_TOPIC --quiet

# Delete Cloud Function
gcloud functions delete $env:FUNCTION_NAME `
    --gen2 `
    --region=$env:REGION `
    --quiet

# Delete Cloud Run gateway service
gcloud run services delete $env:GATEWAY_NAME `
    --region=$env:REGION `
    --quiet

# Delete Artifact Registry repository (and all images inside)
gcloud artifacts repositories delete $env:ARTIFACT_REPO `
    --location=$env:REGION `
    --quiet

# Delete Firestore database
gcloud firestore databases delete `
    --database=$env:FIRESTORE_DB_NAME `
    --quiet
