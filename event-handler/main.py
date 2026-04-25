import base64
import json
import logging
import os
from datetime import datetime, timezone

import functions_framework
import requests
from google.cloud import firestore

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

FIRESTORE_DB_NAME = os.environ.get("FIRESTORE_DB_NAME", "(default)")
PROJECT_ID        = os.environ.get("GOOGLE_CLOUD_PROJECT")
GATEWAY_URL       = os.environ.get("GATEWAY_URL")

db = firestore.Client(project=PROJECT_ID, database=FIRESTORE_DB_NAME)

stats_collection     = db.collection("movie-stats")
processed_collection = db.collection("processed-messages")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def notify_gateway(message_id: str, data: dict):
    """Fire-and-forget notification to the WebSocket gateway."""
    if not GATEWAY_URL:
        logger.warning("GATEWAY_URL is not set, skipping notification")
        return

    try:
        response = requests.post(
            GATEWAY_URL,
            json={"messageId": message_id, "data": data},
            timeout=5,
        )
        response.raise_for_status()
        logger.info(json.dumps({"msg": "Gateway notified", "messageId": message_id}))
    except requests.exceptions.RequestException as e:
        logger.error(json.dumps({"msg": "Gateway notification failed", "error": str(e)}))


def process_event(message_id: str, data: dict) -> dict:
    """Idempotent processing: updates movie stats and marks the message processed."""

    processed_ref = processed_collection.document(message_id)
    if processed_ref.get().exists:
        logger.info(json.dumps({
            "msg": "Duplicate message skipped",
            "messageId": message_id,
            "movieId": data.get("movieId"),
        }))
        return {"status": "duplicate"}

    movie_id = data.get("movieId")
    if not movie_id:
        raise ValueError("Missing movieId in payload")

    stats_ref = stats_collection.document(movie_id)
    stats_doc = stats_ref.get()
    now = _now_iso()

    if stats_doc.exists:
        stats_ref.update({
            "viewCount": firestore.Increment(1),
            "lastViewed": now,
            "updatedAt": now,
        })
    else:
        stats_ref.set({
            "movieId": movie_id,
            "movieTitle": data.get("movieTitle", "Unknown"),
            "viewCount": 1,
            "lastViewed": now,
            "createdAt": now,
            "updatedAt": now,
        })

    processed_ref.set({"processedAt": now, "movieId": movie_id})

    logger.info(json.dumps({
        "msg": "Event processed",
        "messageId": message_id,
        "movieId": movie_id,
        "event": data.get("event"),
    }))

    return {"status": "processed"}


@functions_framework.http
def pubsub_handler(request):
    """HTTP endpoint invoked by a Pub/Sub push subscription."""
    try:
        envelope = request.get_json(silent=True)
        if not envelope or "message" not in envelope:
            logger.warning("Invalid Pub/Sub push envelope")
            return ("Bad Request: no Pub/Sub message", 400)

        message    = envelope["message"]
        message_id = message.get("messageId", "unknown")
        raw_data   = message.get("data", "")

        if not raw_data:
            logger.warning("Empty Pub/Sub message data")
            return ("", 204)

        decoded = base64.b64decode(raw_data).decode("utf-8")
        data    = json.loads(decoded)

        result = process_event(message_id, data)
        if result.get("status") != "duplicate":
            notify_gateway(message_id, data)

        logger.info(json.dumps({
            "msg": "Push message handled",
            "messageId": message_id,
            "result": result["status"],
        }))

        return (json.dumps(result), 200, {"Content-Type": "application/json"})

    except Exception as e:
        logger.exception(json.dumps({"msg": "Error processing message", "error": str(e)}))
        return (f"Error: {e}", 500)
