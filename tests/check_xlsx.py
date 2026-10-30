# Проверка, что файл из export.test.js открывается как настоящий Excel
import sys, datetime, openpyxl

wb = openpyxl.load_workbook(sys.argv[1])
ws = wb.active
rows = list(ws.iter_rows(values_only=True))
assert len(rows) == 13, len(rows)
assert rows[1][0] == datetime.datetime(2026, 10, 30), rows[1][0]
assert rows[1][4] == 100 and rows[1][5] == 5
fran = [r for r in rows if r[1] == 'Фран'][0]
assert fran[7] == datetime.timedelta(minutes=4, seconds=32), fran[7]
print('xlsx ok:', len(rows) - 1, 'строк')
