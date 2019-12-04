FNAME = "whatscookin_sheet.csv"
OUTNAME = "cards.json"
TEMPL = """@
	"name": "{}",
	"type": "{}",
	"value": {},
	"count": {},
	"mod_text":"{}",
	"mod":{},
	"img":"{}"
&,"""

def process_row(row):
    if row.startswith("name"):
        return
    _name,_type,_value,_count,_bonus,_pen,_img = row.split(",")
    _count = int(_count)
    _img = _img.strip()
    _value = [int(x) for x in _value.split("|")]
    if len(_value) == 1:
        _value = _value*3
    return(TEMPL.format(_name,_type,_value,_count,_bonus+("/" if _pen else "")+_pen,'{}',_img).replace("@","{").replace("&","}"))

o = open(OUTNAME, "w")
for line in open(FNAME):
    p = process_row(line)
    if p:
        o.write(p+"\n")
o.close()
    
