
from flask import Flask, request, jsonify
from flask_cors import CORS
from database import get_db_connection, init_db
from datetime import datetime

app = Flask(__name__)
CORS(app)

# Initialize the database
init_db()

VALID_STATUSES = ("Pending", "Completed")
VALID_PRIORITIES = ("Low", "Medium", "High")


def task_to_dict(task):
    return dict(task)


def validate_deadline(deadline):
    if deadline is None:
        return None

    if not isinstance(deadline, str):
        return "Invalid deadline"

    try:
        datetime.strptime(deadline, "%Y-%m-%d")
    except ValueError:
        return "Deadline must use YYYY-MM-DD format"

    return None


# GET: View, search, and filter tasks
@app.route("/api/tasks", methods=["GET"])
def get_tasks():
    status = request.args.get("status")
    search = request.args.get("search", "").strip()

    query = "SELECT * FROM tasks WHERE 1=1"
    params = []

    if status in VALID_STATUSES:
        query += " AND status = ?"
        params.append(status)

    if search:
        query += " AND (title LIKE ? OR description LIKE ?)"
        params.extend([f"%{search}%", f"%{search}%"])

    query += """
        ORDER BY
            CASE WHEN deadline IS NULL OR deadline = '' THEN 1 ELSE 0 END,
            deadline ASC,
            id DESC
    """

    connection = get_db_connection()
    try:
        tasks = connection.execute(query, params).fetchall()
        return jsonify([task_to_dict(task) for task in tasks]), 200
    finally:
        connection.close()


# POST: Create a task
@app.route("/api/tasks", methods=["POST"])
def create_task():
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({"error": "A valid JSON object is required"}), 400

    title = data.get("title")
    description = data.get("description", "")
    deadline = data.get("deadline") or None
    priority = data.get("priority", "Medium")
    status = data.get("status", "Pending")

    if not isinstance(title, str) or not title.strip():
        return jsonify({"error": "Task title is required"}), 400

    if not isinstance(description, str):
        return jsonify({"error": "Description must be text"}), 400

    if priority not in VALID_PRIORITIES:
        return jsonify({"error": "Priority must be Low, Medium, or High"}), 400

    if status not in VALID_STATUSES:
        return jsonify({"error": "Status must be Pending or Completed"}), 400

    error = validate_deadline(deadline)
    if error:
        return jsonify({"error": error}), 400

    connection = get_db_connection()
    try:
        cursor = connection.execute(
            """
            INSERT INTO tasks
                (title, description, deadline, priority, status)
            VALUES (?, ?, ?, ?, ?)
            """,
            (title.strip(), description.strip(), deadline, priority, status),
        )
        connection.commit()

        task = connection.execute(
            "SELECT * FROM tasks WHERE id = ?",
            (cursor.lastrowid,),
        ).fetchone()

        return jsonify(task_to_dict(task)), 201
    finally:
        connection.close()


# PUT: Update a task
@app.route("/api/tasks/<int:task_id>", methods=["PUT"])
def update_task(task_id):
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({"error": "A valid JSON object is required"}), 400

    title = data.get("title")
    description = data.get("description", "")
    deadline = data.get("deadline") or None
    priority = data.get("priority", "Medium")

    if not isinstance(title, str) or not title.strip():
        return jsonify({"error": "Task title is required"}), 400

    if not isinstance(description, str):
        return jsonify({"error": "Description must be text"}), 400

    if priority not in VALID_PRIORITIES:
        return jsonify({"error": "Priority must be Low, Medium, or High"}), 400

    error = validate_deadline(deadline)
    if error:
        return jsonify({"error": error}), 400

    connection = get_db_connection()
    try:
        existing = connection.execute(
            "SELECT * FROM tasks WHERE id = ?", (task_id,)
        ).fetchone()

        if existing is None:
            return jsonify({"error": "Task not found"}), 404

        # Preserve existing status if the frontend does not send it.
        status = data.get("status", existing["status"])

        if status not in VALID_STATUSES:
            return jsonify({"error": "Status must be Pending or Completed"}), 400

        connection.execute(
            """
            UPDATE tasks
            SET title = ?, description = ?, deadline = ?,
                priority = ?, status = ?
            WHERE id = ?
            """,
            (
                title.strip(),
                description.strip(),
                deadline,
                priority,
                status,
                task_id,
            ),
        )
        connection.commit()

        updated_task = connection.execute(
            "SELECT * FROM tasks WHERE id = ?", (task_id,)
        ).fetchone()

        return jsonify(task_to_dict(updated_task)), 200
    finally:
        connection.close()


# PATCH: Change task status
@app.route("/api/tasks/<int:task_id>/status", methods=["PATCH"])
def update_task_status(task_id):
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({"error": "A valid JSON object is required"}), 400

    status = data.get("status")

    if status not in VALID_STATUSES:
        return jsonify({"error": "Status must be Pending or Completed"}), 400

    connection = get_db_connection()
    try:
        cursor = connection.execute(
            "UPDATE tasks SET status = ? WHERE id = ?",
            (status, task_id),
        )
        connection.commit()

        if cursor.rowcount == 0:
            return jsonify({"error": "Task not found"}), 404

        task = connection.execute(
            "SELECT * FROM tasks WHERE id = ?", (task_id,)
        ).fetchone()

        return jsonify(task_to_dict(task)), 200
    finally:
        connection.close()


# DELETE: Delete a task
@app.route("/api/tasks/<int:task_id>", methods=["DELETE"])
def delete_task(task_id):
    connection = get_db_connection()
    try:
        cursor = connection.execute(
            "DELETE FROM tasks WHERE id = ?", (task_id,)
        )
        connection.commit()

        if cursor.rowcount == 0:
            return jsonify({"error": "Task not found"}), 404

        return jsonify({"message": "Task deleted successfully"}), 200
    finally:
        connection.close()


if __name__ == "__main__":
    app.run(debug=True, port=5000)
