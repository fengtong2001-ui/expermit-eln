#!/usr/bin/env python3
"""把旧版 ExPermit 的 SQLite 数据库导出成新版「设置 → 从旧版导入」能读的 JSON。

只读打开数据库，不修改旧数据。
用法：python3 scripts/export-legacy.py "/path/to/expermit record/data/expermit.db" [输出.json]
"""
import json
import sqlite3
import sys
from pathlib import Path

TABLES = {
    "experiments": "experiments",
    "reagents": "reagents",
    "schedules": "schedules",
    "usage": "reagent_usage",
    "data_records": "data_records",
}


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    src = Path(sys.argv[1]).expanduser()
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("expermit-旧版导出.json")
    con = sqlite3.connect(f"file:{src}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    existing = {r[0] for r in con.execute("select name from sqlite_master where type='table'")}
    dump = {}
    for key, table in TABLES.items():
        dump[key] = [dict(r) for r in con.execute(f"select * from {table}")] if table in existing else []
    out.write_text(json.dumps(dump, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"已导出到 {out}：" + "，".join(f"{k} {len(v)} 条" for k, v in dump.items()))


if __name__ == "__main__":
    main()
