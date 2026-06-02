import sqlite3
import os

db_path = r"e:\Gamalipatbis_windows\src-python\DB\gamalipatbis.db"
if not os.path.exists(db_path):
    print(f"DB not found: {db_path}")
else:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Check counts before
    cursor.execute("SELECT COUNT(*) FROM urunler WHERE deleted_at IS NULL")
    before = cursor.fetchone()[0]
    
    # Cleanup duplicates - keep the latest one
    cursor.execute("""
        DELETE FROM urunler 
        WHERE id NOT IN (
            SELECT MAX(id) 
            FROM urunler 
            WHERE deleted_at IS NULL 
            GROUP BY uid
        ) 
        AND deleted_at IS NULL
    """)
    
    deleted = cursor.rowcount
    conn.commit()
    
    # Check counts after
    cursor.execute("SELECT COUNT(*) FROM urunler WHERE deleted_at IS NULL")
    after = cursor.fetchone()[0]
    
    print(f"Cleanup finished.")
    print(f"Items before: {before}")
    print(f"Deleted duplicates: {deleted}")
    print(f"Items after: {after}")
    
    conn.close()
