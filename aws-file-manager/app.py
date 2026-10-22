import os
import uuid
from datetime import datetime, timezone

import boto3
import pymysql
from flask import Flask, flash, redirect, render_template, request, url_for
from werkzeug.utils import secure_filename

app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET_KEY", os.urandom(32).hex())
app.config["MAX_CONTENT_LENGTH"] = int(os.environ.get("MAX_UPLOAD_MB", "25")) * 1024 * 1024

S3_BUCKET = os.environ["S3_BUCKET"]
DB_HOST = os.environ["DB_HOST"]
DB_NAME = os.environ["DB_NAME"]
DB_USER = os.environ["DB_USER"]
DB_PASSWORD = os.environ["DB_PASSWORD"]
MAX_UPLOAD_MB = int(os.environ.get("MAX_UPLOAD_MB", "25"))

s3 = boto3.client("s3", region_name=os.environ.get("AWS_REGION", "ap-south-1"))


def db_connect():
    return pymysql.connect(
        host=DB_HOST,
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME,
        port=3306,
        connect_timeout=8,
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=True,
    )


def ensure_table():
    connection = db_connect()
    try:
        with connection.cursor() as cursor:
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS files (
                    id BIGINT AUTO_INCREMENT PRIMARY KEY,
                    filename VARCHAR(255) NOT NULL,
                    s3_key VARCHAR(500) NOT NULL UNIQUE,
                    file_size BIGINT NOT NULL,
                    content_type VARCHAR(150) NOT NULL,
                    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
    finally:
        connection.close()


@app.before_request
def initialize_database():
    # Retry briefly while RDS finishes becoming available after EC2 boot.
    if getattr(app, "_db_initialized", False):
        return
    import time
    last_error = None
    for _ in range(18):
        try:
            ensure_table()
            app._db_initialized = True
            return
        except Exception as exc:
            last_error = exc
            time.sleep(10)
    app.logger.error("Could not initialize database after retries: %s", last_error)
    # Keep this request usable with a clear error; a later request will retry initialization.


@app.errorhandler(413)
def too_large(_error):
    flash(f"File is too large. Maximum upload size is {MAX_UPLOAD_MB} MB.", "error")
    return redirect(url_for("index"))


@app.route("/", methods=["GET"])
def index():
    files = []
    error = None
    try:
        connection = db_connect()
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT id, filename, s3_key, file_size, content_type, uploaded_at FROM files ORDER BY uploaded_at DESC LIMIT 200")
                files = cursor.fetchall()
        finally:
            connection.close()
    except Exception:
        error = "Database is still starting or temporarily unavailable. Refresh in a minute."
        app.logger.exception("Listing files failed")
    return render_template("index.html", files=files, error=error, max_upload_mb=MAX_UPLOAD_MB)


@app.route("/upload", methods=["POST"])
def upload():
    uploaded = request.files.get("file")
    if not uploaded or not uploaded.filename:
        flash("Choose a file first.", "error")
        return redirect(url_for("index"))

    original_name = secure_filename(uploaded.filename) or "uploaded-file"
    key = f"uploads/{uuid.uuid4().hex}/{original_name}"
    content_type = uploaded.mimetype or "application/octet-stream"
    uploaded.seek(0, os.SEEK_END)
    size = uploaded.tell()
    uploaded.seek(0)

    try:
        s3.upload_fileobj(
            uploaded,
            S3_BUCKET,
            key,
            ExtraArgs={"ContentType": content_type, "ServerSideEncryption": "AES256"},
        )
    except Exception:
        app.logger.exception("S3 upload failed")
        flash("Upload to S3 failed. Check the EC2 IAM role and bucket permissions.", "error")
        return redirect(url_for("index"))

    try:
        connection = db_connect()
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    "INSERT INTO files (filename, s3_key, file_size, content_type) VALUES (%s, %s, %s, %s)",
                    (original_name, key, size, content_type),
                )
        finally:
            connection.close()
    except Exception:
        # Avoid orphaned objects if the metadata insert fails.
        try:
            s3.delete_object(Bucket=S3_BUCKET, Key=key)
        except Exception:
            app.logger.exception("Cleanup of orphaned S3 object failed")
        app.logger.exception("Metadata insert failed")
        flash("File reached S3, but saving metadata failed. Please retry.", "error")
        return redirect(url_for("index"))

    flash(f"Uploaded {original_name} successfully.", "success")
    return redirect(url_for("index"))


@app.route("/download/<int:file_id>", methods=["GET"])
def download(file_id):
    try:
        connection = db_connect()
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT filename, s3_key FROM files WHERE id = %s", (file_id,))
                row = cursor.fetchone()
        finally:
            connection.close()
        if not row:
            flash("File not found.", "error")
            return redirect(url_for("index"))
        signed_url = s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": S3_BUCKET, "Key": row["s3_key"], "ResponseContentDisposition": f'attachment; filename="{row["filename"].replace(chr(34), "")}"'},
            ExpiresIn=300,
        )
        return redirect(signed_url)
    except Exception:
        app.logger.exception("Download URL generation failed")
        flash("Could not generate download link.", "error")
        return redirect(url_for("index"))


@app.route("/health", methods=["GET"])
def health():
    return {"status": "ok", "time": datetime.now(timezone.utc).isoformat()}, 200


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=80)
