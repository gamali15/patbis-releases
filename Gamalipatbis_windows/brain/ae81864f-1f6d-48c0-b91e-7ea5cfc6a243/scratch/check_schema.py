import sqlite3

db_path = r"e:\Gamalipatbis_windows\src-python\DB\gamalipatbis.db"
conn = sqlite3.connect(db_path)
print("--- TABLE ---")
row = conn.execute("SELECT sql FROM sqlite_master WHERE name='urunler'").fetchone()
if row:
    print(row[0])

print("\n--- INDICES ---")
for row in conn.execute("SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='urunler'").fetchall():
    print(f"{row[0]}: {row[1]}")
