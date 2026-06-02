import sqlite3
import os

db_path = r"e:\Gamalipatbis_windows\src-python\DB\gamalipatbis.db"
if not os.path.exists(db_path):
    print(f"DB not found: {db_path}")
else:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT uid, COUNT(*) FROM urunler WHERE deleted_at IS NULL GROUP BY uid HAVING COUNT(*) > 1")
    dupes = cursor.fetchall()
    print(f"Found {len(dupes)} duplicate UIDs in active stock.")
    for d in dupes[:10]:
        print(f"UID: {d[0]}, Count: {d[1]}")
    conn.close()
