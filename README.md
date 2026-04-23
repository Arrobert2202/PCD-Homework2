# PCD-Homework2

This project expands the **Fast Lazy Bee** application with a microservices-based, event-driven architecture hosted on GCP. It is designed to ingest, process, and serve real-time access analytics for movie resources.

## Architecture

The system is composed of six independently deployed components that work together to deliver real-time analytics:

1. **Service A (Fast Lazy Bee)**: A REST API hosted on Cloud Run. Acting as the message producer, it asynchronously publishes an event to Pub/Sub whenever a movie resource is accessed.

2. **Google Cloud Pub/Sub**: The central message broker. It decouples the core API from the processing pipeline, reliably routing events via the movie-events topic.

3. **Analytics Processor (Cloud Function)**: A Python 3.12 FaaS triggered via a Pub/Sub Push Subscription. It includes custom idempotency logic to handle Pub/Sub's at-least-once delivery guarantees, ensuring accurate updates to the movie viewCount.

4. **Firestore Database**: Operating in Native Mode, this serves as the stateful Analytics Store. It persists the aggregated movie statistics and tracks processed message IDs to prevent duplicate processing.

5. **WebSocket Gateway**: A Node.js service on Cloud Run that manages real-time, persistent WebSocket connections with clients. It receives updates from the Analytics Processor and broadcasts them live to the frontend.

6. **React Web Client**: A real-time dashboard UI. Connected to the Gateway via WebSockets, it dynamically displays recent activity, top-viewed movies, API latency, and active user counts.

## Prerequisites & Configuration

Before starting the deployment process, verify that both your local development environment and your GCP project are fully configured.

### 1. Local Setup
* Install [Google Cloud SDK (gcloud CLI)](https://cloud.google.com/sdk/docs/install).
* Install **Docker** desktop.
* Have a functional **MongoDB Atlas** cluster (M0 Sandbox is fine).

### 2. GCP Authentication & Project Setup
You need to authenticate and set your active project:
```bash
gcloud auth login
```
```bash
gcloud config set project YOUR_PROJECT_ID
```

### 3. Required Permissions & APIs
The account running the deployment scripts must have the Owner/Editor role on the GCP project, or specifically permissions to manage Cloud Run, Cloud Functions, Pub/Sub, Firestore, and Artifact Registry. 
Ensure the following Google Cloud APIs are enabled before proceeding:
```bash
gcloud services enable run.googleapis.com cloudbuild.googleapis.com pubsub.googleapis.com firestore.googleapis.com artifactregistry.googleapis.com cloudfunctions.googleapis.com
```

### 4. MongoDB Configuration
**MAKE SURE YOU ADD YOUR OWN MONGODB URL INSIDE `deploy.sh`** (or `deploy.ps1` if using Windows). 
Open the deployment script and edit the `MONGO_URL` variable before running it, otherwise, Service A will crash on startup.

## Build and Deploy Instructions

This project features a fully automated deployment process using Bash scripts, eliminating the need for any manual infrastructure configuration via the GCP Console.

1. **Clone the repository** and navigate to the project root:
    ```bash
    git clone <your-repo-url>
    cd <your-repo-directory>
    ```
2. **Grant execution permissions** to the deployment script:
    ```bash
   chmod +x deploy.sh
   ```
3. **Execute the deployment script**:
   ```bash
   ./deploy.sh
   ```
   *(Note: Behind the scenes, the script compiles the React app, bundles the static files into the Gateway, provisions the Pub/Sub topics, sets up the Firestore database, and deploys all serverless components to Cloud Functions and Cloud Run.)*
4. Once the deployment completes, the terminal will display the public URLs for the live Dashboard and all associated microservices.

## Testing Instructions

To test the full data flow, eventual consistency, and asynchronous communication, we recommend using a visual API testing tool like **Postman** or **Thunder Client** (VS Code extension) to avoid browser pre-fetching issues.

1. **Open the Dashboard**: Navigate to the Gateway URL returned by the deploy script in your browser. Wait for the status indicator to show *"Connected Live"*.
2. **Generate Events**: Open your API testing tool (e.g., Postman).
   * Create a new `GET` request.
   * Enter the URL of your Fast Lazy Bee service, appending a valid MongoDB movie ID. 
     *Format:* `https://<URL_FAST_LAZY_BEE>/api/movies/<MOVIE_ID>`
   * Click **Send** to simulate a user accessing a movie.
3. **Observe the Eventual Consistency**:
   * Watch the Dashboard. After a short network delay (the consistency window), the event will pop up in the **"Live Activity Feed"**, demonstrating real-time WebSocket communication.
   * The **"Top Viewed Movies"** leaderboard will automatically update in the background, reflecting the newly aggregated data from Firestore.

## Teardown & Resource Cleanup

To avoid unexpected charges on your Google Cloud billing account, it is imperative to destroy the infrastructure when you are done testing. Run the dedicated teardown script to delete all services, topics, subscriptions, and Docker images:

```bash
chmod +x teardown.sh
./teardown.sh
```
**MongoDB Atlas**: Manage or delete your cluster directly from the MongoDB dashboard as it is not deleted with the script.