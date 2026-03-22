import os
import re
import json
import time
import uuid
import threading
from queue import Queue
from datetime import datetime

from flask import Flask, request, jsonify, render_template, Response, send_file, after_this_request
from werkzeug.utils import secure_filename
import pandas as pd
import openpyxl
from openai import OpenAI
from docx import Document
from docx.shared import Pt, RGBColor
import docx

# ==========================================
# KONFIGURÁCIÓ
# ==========================================
app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['DOWNLOAD_FOLDER'] = 'downloads'
app.config['PROMPTS_FOLDER'] = 'prompts'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16 MB limit

os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
os.makedirs(app.config['DOWNLOAD_FOLDER'], exist_ok=True)
os.makedirs(app.config['PROMPTS_FOLDER'], exist_ok=True)

@app.after_request
def add_header(response):
    response.headers['X-Frame-Options'] = 'ALLOWALL'
    response.headers['Access-Control-Allow-Origin'] = '*'
    return response

try:
    client = OpenAI()
except Exception as e:
    print(f"Figyelem: OpenAI kliens inicializálási hiba: {e}")
    client = None

AVAILABLE_MODELS = [
    "gpt-5.4",
    "gpt-5.4-mini",
    "gpt-5.4-nano",
    "gpt-5.4-pro",
    "gpt-4.1",
    "gpt-4.1-mini",
    "gpt-4.1-nano",
]
DEFAULT_MODEL = "gpt-5.4-mini"

FORBIDDEN_PHRASES = [
    "Az oldal szerint", "A leírás szerint", "Ez nem bénázás",
    "Tapasztalatból mondom", "ez nem csak", "talán", "nagyjából", "bizonyos értelemben"
]

generation_jobs = {}

# ==========================================
# TONE GUIDE ÉS PIPELINE FÁJLRENDSZER
# ==========================================
TONE_GUIDE_PATH = os.path.join(app.config['PROMPTS_FOLDER'], 'tone_guide.txt')
PIPELINE_PATH = os.path.join(app.config['PROMPTS_FOLDER'], 'pipeline.json')

DEFAULT_TONE_GUIDE = """1. Magas szintű áttekintés
Általános stílusösszefoglaló
Ez a stílus közérthető, pragmatikus, döntést segítő szakmai tartalomírás. Nem irodalmi, nem játékos, és nem is akadémikus: inkább olyan, mintha egy tapasztalt tanácsadó leülne melléd, és gyorsan rendet rakna a témában. A mondanivaló mindig lebontott, „megfogható", kézzelfogható szempontokra van osztva, ezért az olvasó ritkán marad absztrakt állításokkal egyedül. A forma végig azt sugallja: „itt most tisztázzuk a helyzetet, és kapsz egy biztonságos következő lépést."

Szerzői persona (következtetve)
A domináns persona: szakértő tanácsadó + türelmes magyarázó + finoman értékesítő konzultáns. A szerző nem haverkodik, és nem fölülről beszél: inkább „kompetens vezetőként" vagy „józan eligazítóként" szólal meg.

Az írás elsődleges céljai
Az elsődleges célok: tisztázni, bizonytalanságot csökkenteni, szakértői hitelességet építeni, majd óvatosan konverzióba terelni. A legtöbb cikk előbb oktat, aztán keretez, és csak utána ajánl szolgáltatást vagy következő lépést. Ezért a meggyőzés itt nem agresszív, hanem strukturális: a józan rendrakásból nő ki.

2. Hang és tónus
Hang
A hang félformális, közvetlen, társalgóan szakmai. Nem laza, de nem merev. Gyakori a második személyű megszólítás ("neked", "nálad", "ha szeretnéd"), illetve a vállalati többes első személy ("bemutatjuk", "segítünk", "átnézzük"), ami egyszerre sugall szakértelmet és szolgáltatói jelenlétet.

8. Stílusszabályok / Ellenőrzőlista
Hangszabályok
- Beszélj úgy, mint egy hozzáértő tanácsadó, ne úgy, mint egy reklámszövegíró, aki túl korán eladni akar.
- Az első 2–4 mondatban nevezd meg az olvasó valós helyzetét vagy félreértését.
- Használj közvetlen, de nem haverkodó megszólalást.
- Mutass empátiát a problémára, de maradj rendezett és tárgyszerű.
- Legyen a hangod magabiztos, de ne hangoskodó.
- Inkább eligazíts, mint lenyűgözz.
- A hitelességet konkrétumokkal építsd, ne önfényezéssel.
- A CTA előtt adj valódi értéket és egyértelmű gondolati rendet.

NE tedd
- Ne írj hosszú, díszes, többszörösen alárendelt mondatokat.
- Ne használj túl sok bizonytalanító puhaságot, mint a „talán", „nagyjából", „bizonyos értelemben".
- Ne menj át teljesen sales-es hype-ba az első bekezdésekben.
- Ne hagyd, hogy egy szakasz cím nélkül, tömbszövegként ömöljön rá az olvasóra.
- Ne legyen ilyen stílusú mondat: „ez nem csak X, hanem Y"
- Felkiáltójel szinte ne legyen."""

DEFAULT_PIPELINE = {
    "steps": [
        {
            "id": 1,
            "name": "Cikk generálás",
            "type": "generate",
            "enabled": True,
            "prompt": """Te egy senior SEO-szövegíró és tartalomstratéga vagy. Magyarul írsz, természetesen, marketing-szag nélkül, de konverzióra optimalizálva.
Írj egy minőségi, keresőoptimalizált blogcikket a következő szolgáltatás oldal támogatására, és organikus forgalom + érdeklődők szerzésére.

Cég honlapjának url-je: {ceg_url}
Cikk címe: {cikk_cim}

Helyezz el rajta linkeket az alábbi kulcsszavakról az adott oldalakra, összesen {link_db} link legyen egy cikkben, a linkbe semmiképp ne illessz utm paramétert (Markdown formátumban illeszd be a linkeket a szövegbe):
{linkek_felsorolasa}

{opcionalis_korabbi_cikkek_blokk}

Követelmények a cikkhez
Nyelv: magyar
Terjedelem: 600-1000 szó
E-E-A-T: jelezd a szakértelmet (folyamat, módszer, tapasztalati jelek), kerüld a túlzó ígéreteket.
Kimenet:
Csak a teljes cikket add vissza.
Ne adj title, meta, outline elemzést.
Az alcímeket Markdown formátumban add meg: ## Alcím (két hashtaggel), a szövegben ne szerepeljen a főcím (azt külön adjuk hozzá).

Fontos:
Ne tömj kulcsszót, legyen természetes.
Ne találj ki konkrét statisztikát; ha számot írsz, legyen általános vagy jelöld természetes módon, hogy "példa".
Ha írsz állításokat a céggel kapcsolatban, csakis valósakat írj, olyanokat, melyek megtalálhatók a cég honlapján, ne találj ki nem valós információkat.
Ne legyenek benne ilyen jellegű megfogalmazások:
"Az oldal szerint …", "A leírás szerint …"
"Ez nem bénázás, hanem profizmus."
"Tapasztalatból mondom"
Ne tegyél be forrás hivatkozásokat a bekezdések végére, csak az általam kért hivatkozások szerepeljenek a szövegben.
Ne legyél túlságosan közvetlen.
Ne használj ilyen szerkezetű mondatot: "ez nem csak X, hanem Y".
Ne használj bizonytalanító szavakat döntéstámogató szövegben: talán, nagyjából, bizonyos értelemben.

Stílus és hangnem útmutató:
{tone_guide}{megjegyzes_blokk}"""
        },
        {
            "id": 2,
            "name": "Tényellenőrzés",
            "type": "check",
            "enabled": True,
            "prompt": """Az alábbi cikket ellenőrizd le: tartalmaz-e olyan konkrét állítást a cégről, amely nem ellenőrizhető a cég honlapjáról ({ceg_url}), vagy nyilvánvalóan kitalált/valótlan? Csak akkor jelezz problémát, ha egyértelmű kitalált állítás van. Válaszolj így: "OK" ha nincs probléma, vagy "JAVÍTANDÓ: [probléma rövid leírása]" ha van.

Cikk:
{aktualis_cikk}"""
        },
        {
            "id": 3,
            "name": "Link és UTM ellenőrzés",
            "type": "check",
            "enabled": True,
            "prompt": """Ellenőrizd az alábbi cikket:
1. Tartalmaz-e olyan linket, amelyben utm_ paraméter szerepel? Ha igen, jelöld meg pontosan melyik link és mi a probléma.
2. Szerepelnek-e a cikkben a következő elvárt kulcsszavak/linkek: {elvart_linkek}? Ha valamelyik hiányzik, jelöld meg.

Válaszolj így:
- "OK" ha minden rendben
- "JAVÍTANDÓ: [pontos probléma leírása]" ha van probléma

Cikk:
{aktualis_cikk}"""
        },
        {
            "id": 4,
            "name": "Formátum és nyelvezet ellenőrzés",
            "type": "check",
            "enabled": True,
            "prompt": """Ellenőrizd az alábbi magyar nyelvű cikket az alábbi szempontok szerint:

1. Szerepelnek-e benne tiltott fordulatok? Tiltott: "Az oldal szerint", "A leírás szerint", "Ez nem bénázás", "Tapasztalatból mondom", "ez nem csak", "talán", "nagyjából", "bizonyos értelemben", "felkiáltójel"
2. A mondatok megfelelően rövidek-e, van-e túl hosszú, nehezen érthető mondat?
3. Megfelelő-e a bekezdésstruktúra (1-3 mondatos blokkok)?
4. Van-e ## jelű H2 alcím a cikkben (legalább 2 kell)?

Válaszolj így:
- "OK" ha minden rendben
- "JAVÍTANDÓ: [pontos probléma leírása]" ha van probléma

Cikk:
{aktualis_cikk}"""
        },
        {
            "id": 5,
            "name": "Javítás",
            "type": "fix",
            "enabled": True,
            "prompt": """Az alábbi cikket kérlek javítsd ki a megjelölt problémák alapján. Csak a teljes javított cikket add vissza, semmi mást.

Problémák:
{javitasi_problemak}

Eredeti cikk:
{aktualis_cikk}"""
        }
    ],
    "versions": []
}

def load_tone_guide():
    if os.path.exists(TONE_GUIDE_PATH):
        with open(TONE_GUIDE_PATH, 'r', encoding='utf-8') as f:
            return f.read()
    return DEFAULT_TONE_GUIDE

def save_tone_guide(text):
    with open(TONE_GUIDE_PATH, 'w', encoding='utf-8') as f:
        f.write(text)

def load_pipeline_data():
    if os.path.exists(PIPELINE_PATH):
        with open(PIPELINE_PATH, 'r', encoding='utf-8') as f:
            return json.load(f)
    return DEFAULT_PIPELINE.copy()

def save_pipeline_data(steps):
    data = load_pipeline_data()
    old_steps = data.get('steps', [])
    versions = data.get('versions', [])
    
    if old_steps:
        versions.append({
            'version': len(versions) + 1,
            'steps': old_steps,
            'saved_at': datetime.now().isoformat(timespec='seconds')
        })
    
    data['steps'] = steps
    data['versions'] = versions
    
    with open(PIPELINE_PATH, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def init_files():
    if not os.path.exists(TONE_GUIDE_PATH):
        save_tone_guide(DEFAULT_TONE_GUIDE)
    if not os.path.exists(PIPELINE_PATH):
        with open(PIPELINE_PATH, 'w', encoding='utf-8') as f:
            json.dump(DEFAULT_PIPELINE, f, ensure_ascii=False, indent=2)

init_files()

# ==========================================
# SEGÉDFÜGGVÉNYEK (Word formázás)
# ==========================================
def add_hyperlink(paragraph, url, text):
    part = paragraph.part
    r_id = part.relate_to(url, docx.opc.constants.RELATIONSHIP_TYPE.HYPERLINK, is_external=True)

    hyperlink = docx.oxml.shared.OxmlElement('w:hyperlink')
    hyperlink.set(docx.oxml.shared.qn('r:id'), r_id)

    new_run = docx.oxml.shared.OxmlElement('w:r')
    rPr = docx.oxml.shared.OxmlElement('w:rPr')

    color = docx.oxml.shared.OxmlElement('w:color')
    color.set(docx.oxml.shared.qn('w:val'), '0000FF')
    rPr.append(color)

    u = docx.oxml.shared.OxmlElement('w:u')
    u.set(docx.oxml.shared.qn('w:val'), 'single')
    rPr.append(u)

    new_run.append(rPr)

    text_node = docx.oxml.shared.OxmlElement('w:t')
    text_node.text = text
    new_run.append(text_node)

    hyperlink.append(new_run)
    paragraph._p.append(hyperlink)

    return hyperlink

def add_formatted_runs(p, line):
    pattern = r'(\*\*.*?\*\*|\[.*?\]\(.*?\))'
    parts = re.split(pattern, line)

    for part in parts:
        if not part:
            continue
        if part.startswith('**') and part.endswith('**'):
            run = p.add_run(part[2:-2])
            run.bold = True
        elif part.startswith('[') and '](' in part and part.endswith(')'):
            text_end = part.find('](')
            link_text = part[1:text_end]
            url = part[text_end+2:-1]
            add_hyperlink(p, url, link_text)
        else:
            p.add_run(part)

def format_markdown_to_docx(doc, text):
    lines = text.split('\n')

    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue

        if stripped.startswith('### '):
            heading = doc.add_heading(stripped[4:], level=3)
            heading.style.font.color.rgb = RGBColor(0, 0, 0)
        elif stripped.startswith('## '):
            heading = doc.add_heading(stripped[3:], level=2)
            heading.style.font.color.rgb = RGBColor(0, 0, 0)
        elif stripped.startswith('# '):
            heading = doc.add_heading(stripped[2:], level=1)
            heading.style.font.color.rgb = RGBColor(0, 0, 0)
        elif re.match(r'^[-*] ', stripped):
            p = doc.add_paragraph(style='List Bullet')
            add_formatted_runs(p, stripped[2:])
        elif re.match(r'^\d+\.\s\*\*', stripped):
            content = re.sub(r'^\d+\.\s', '', stripped)
            heading_text = content.strip('*').strip()
            heading = doc.add_heading(heading_text, level=3)
            heading.style.font.color.rgb = RGBColor(0, 0, 0)
        elif re.match(r'^\d+\.\s', stripped):
            p = doc.add_paragraph(style='List Number')
            content = re.sub(r'^\d+\.\s', '', stripped)
            add_formatted_runs(p, content)
        elif re.match(r'^\*\*\d+\.', stripped):
            heading_text = stripped.strip('*').strip()
            heading = doc.add_heading(heading_text, level=3)
            heading.style.font.color.rgb = RGBColor(0, 0, 0)
        else:
            p = doc.add_paragraph()
            add_formatted_runs(p, stripped)

# ==========================================
# CIKK GENERÁLÓ LOGIKA (PIPELINE)
# ==========================================
def validate_article(text, keywords):
    """Kód alapú ellenőrzések: UTM, tiltott fordulatok, szószám, kulcsszavak."""
    errors = []
    if "utm_" in text.lower():
        errors.append("A cikkben található linkek utm_ paramétert tartalmaznak.")

    for phrase in FORBIDDEN_PHRASES:
        if phrase.lower() in text.lower():
            errors.append(f"Tiltott kifejezés szerepel a szövegben: '{phrase}'")

    word_count = len(re.findall(r'\b\w+\b', text))
    if word_count < 600:
        errors.append(f"A cikk túl rövid ({word_count} szó). Minimum 600 szónak kell lennie.")
    elif word_count > 1000:
        errors.append(f"A cikk túl hosszú ({word_count} szó). Maximum 1000 szónak kell lennie.")

    missing_keywords = []
    text_lower = text.lower()
    for kw in keywords:
        if kw.lower() not in text_lower:
            missing_keywords.append(kw)

    if missing_keywords:
        errors.append(f"A következő kulcsszavak hiányoznak a szövegből: {', '.join(missing_keywords)}")

    return errors

def safe_format(template, variables):
    """Biztonságos string formázás, ami figyelmen kívül hagyja a hiányzó változókat."""
    class SafeDict(dict):
        def __missing__(self, key):
            return '{' + key + '}'
    return template.format_map(SafeDict(variables))

def call_llm(prompt_text, model, temperature=0.7):
    try:
        response = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt_text}],
            temperature=temperature
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        return f"API Hiba: {str(e)}"

def generate_single_article(row_data, job_id, row_index, model):
    job = generation_jobs[job_id]

    def update_status(status, message):
        job['rows'][row_index]['status'] = status
        if message:
            job['rows'][row_index]['message'] = message
        job['events'].put({
            'type': 'row_update',
            'row_index': row_index,
            'status': status,
            'message': message
        })

    # Változók előkészítése
    vars_dict = {k: str(v) for k, v in row_data.items()}
    
    links = []
    keywords = []
    for i in range(1, 6):
        kw = row_data.get(f'link_{i}_kulcsszo', '')
        url = row_data.get(f'link_{i}_url', '')
        if kw and url:
            links.append(f"- [{kw}]({url})")
            keywords.append(kw)
            
    vars_dict['link_db'] = str(len(links))
    vars_dict['linkek_felsorolasa'] = "\n".join(links)
    vars_dict['elvart_linkek'] = ", ".join(keywords) if keywords else "nincs megadva"

    korabbi_cikkek = []
    for i in range(1, 3):
        url = row_data.get(f'korabbi_cikk_url_{i}', '')
        if url:
            korabbi_cikkek.append(f"- {url}")

    if korabbi_cikkek:
        vars_dict['opcionalis_korabbi_cikkek_blokk'] = (
            "Kérlek, helyezz el természetes hivatkozást a következő korábbi cikk(ek)re is "
            "(a megfelelő kontextusban):\n" + "\n".join(korabbi_cikkek)
        )
    else:
        vars_dict['opcionalis_korabbi_cikkek_blokk'] = ""

    megjegyzes = row_data.get('megjegyzes', '')
    vars_dict['megjegyzes_blokk'] = f"\nEgyéb instrukciók ehhez a cikkhez:\n{megjegyzes}" if megjegyzes else ""
    vars_dict['tone_guide'] = load_tone_guide()
    vars_dict['aktualis_cikk'] = ""
    vars_dict['elozo_kimenet'] = ""
    vars_dict['javitasi_problemak'] = ""

    pipeline = load_pipeline_data()
    steps = [s for s in pipeline.get('steps', []) if s.get('enabled', True)]
    
    generate_steps = [s for s in steps if s['type'] == 'generate']
    check_steps = [s for s in steps if s['type'] == 'check']
    fix_steps = [s for s in steps if s['type'] == 'fix']

    if not generate_steps:
        update_status('Hiba', 'Nincs engedélyezett generáló lépés a pipeline-ban!')
        return None

    # 1. Fő generálási fázis (összes generate lépés futtatása sorban)
    update_status('Folyamatban', 'Generálás indítása...')
    
    for step in generate_steps:
        prompt = safe_format(step['prompt'], vars_dict)
        output = call_llm(prompt, model, temperature=0.7)
        
        if output.startswith("API Hiba:"):
            update_status('Hiba', output)
            return None
            
        vars_dict[f"lepes_{step['id']}_kimenet"] = output
        vars_dict['elozo_kimenet'] = output
        vars_dict['aktualis_cikk'] = output
        time.sleep(1)

    # 2. Ellenőrzési és javítási ciklus (max 2 kör)
    for javitas_kor in range(2):
        errors = []
        
        # Kód alapú ellenőrzés
        kod_errors = validate_article(vars_dict['aktualis_cikk'], keywords)
        errors.extend(kod_errors)

        # AI check lépések
        for step in check_steps:
            update_status('Folyamatban', f"{step['name']}...")
            prompt = safe_format(step['prompt'], vars_dict)
            output = call_llm(prompt, model, temperature=0.2)
            
            vars_dict[f"lepes_{step['id']}_kimenet"] = output
            vars_dict['elozo_kimenet'] = output
            
            if output.startswith("JAVÍTANDÓ:"):
                errors.append(f"{step['name']} hiba: {output[10:].strip()}")
            time.sleep(1)

        if not errors:
            if javitas_kor > 0:
                update_status('Kész', f'Javítva {javitas_kor}. körben')
            else:
                update_status('Kész', 'Sikeres generálás')
            return vars_dict['aktualis_cikk']

        # Ha van hiba, de nincs fix lépés
        if not fix_steps:
            update_status('Hiba', f'Hibák találhatók, de nincs javítási lépés engedélyezve. ({len(errors)} hiba)')
            return vars_dict['aktualis_cikk']

        # Javítás futtatása
        update_status('Folyamatban', f'Javítás folyamatban ({javitas_kor+1}/2)... Hibák: {len(errors)}')
        vars_dict['javitasi_problemak'] = "\n".join('- ' + e for e in errors)
        
        for step in fix_steps:
            prompt = safe_format(step['prompt'], vars_dict)
            output = call_llm(prompt, model, temperature=0.5)
            
            if output.startswith("API Hiba:"):
                update_status('Hiba', f"Javítási {output}")
                return None
                
            vars_dict[f"lepes_{step['id']}_kimenet"] = output
            vars_dict['elozo_kimenet'] = output
            vars_dict['aktualis_cikk'] = output
            time.sleep(1)

    update_status('Hiba', 'Nem sikerült javítani a hibákat 2 kör alatt.')
    return vars_dict['aktualis_cikk']

def generation_worker(job_id):
    job = generation_jobs[job_id]
    rows = job['rows']
    model = job.get('model', DEFAULT_MODEL)

    doc = Document()
    sikeres_cikkek = 0

    for idx, row in enumerate(rows):
        if row.get('status') == 'Kész':
            continue

        if not row.get('ceg_url') or not row.get('cikk_cim'):
            job['rows'][idx]['status'] = 'Hiba'
            job['rows'][idx]['message'] = 'Hiányzó cég URL vagy cikk cím'
            job['events'].put({
                'type': 'row_update',
                'row_index': idx,
                'status': 'Hiba',
                'message': 'Hiányzó cég URL vagy cikk cím'
            })
            continue

        article_text = generate_single_article(row, job_id, idx, model)

        if article_text:
            if sikeres_cikkek > 0:
                doc.add_page_break()

            heading = doc.add_heading(row['cikk_cim'], 0)
            heading.style.font.color.rgb = RGBColor(0, 0, 0)

            format_markdown_to_docx(doc, article_text)
            sikeres_cikkek += 1

            job['completed'] += 1
            job['events'].put({
                'type': 'progress',
                'completed': job['completed'],
                'total': job['total']
            })

    if sikeres_cikkek > 0:
        filename = f"keszult_cikkek_{job_id}.docx"
        filepath = os.path.join(app.config['DOWNLOAD_FOLDER'], filename)
        doc.save(filepath)
        job['download_url'] = f"/download/{filename}"

    job['status'] = 'Befejezve'
    job['events'].put({
        'type': 'complete',
        'download_url': job.get('download_url', None)
    })
    job['events'].put(None)

# ==========================================
# ÚTVONALAK – ALAP
# ==========================================
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'Nincs fájl kiválasztva'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'Nincs fájl kiválasztva'}), 400

    if not file.filename.endswith('.xlsx'):
        return jsonify({'error': 'Csak .xlsx fájl tölthető fel'}), 400

    filename = secure_filename(file.filename)
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    file.save(filepath)

    try:
        df = pd.read_excel(filepath)
        df = df.fillna('')

        rows = []
        for _, row in df.iterrows():
            row_dict = row.to_dict()
            row_dict['status'] = 'Várakozik'
            row_dict['message'] = ''
            rows.append(row_dict)

        columns = [col for col in df.columns]

        return jsonify({
            'success': True,
            'columns': columns,
            'rows': rows
        })
    except Exception as e:
        return jsonify({'error': f'Hiba a fájl feldolgozásakor: {str(e)}'}), 500

@app.route('/start-generation', methods=['POST'])
def start_generation():
    data = request.json
    rows = data.get('rows', [])
    model = data.get('model', DEFAULT_MODEL)

    if model not in AVAILABLE_MODELS:
        model = DEFAULT_MODEL

    if not rows:
        return jsonify({'error': 'Nincsenek adatok a generáláshoz'}), 400

    job_id = str(uuid.uuid4())

    generation_jobs[job_id] = {
        'id': job_id,
        'rows': rows,
        'total': len(rows),
        'completed': 0,
        'status': 'Folyamatban',
        'model': model,
        'events': Queue()
    }

    thread = threading.Thread(target=generation_worker, args=(job_id,))
    thread.daemon = True
    thread.start()

    return jsonify({
        'success': True,
        'job_id': job_id
    })

@app.route('/stream/<job_id>')
def stream(job_id):
    if job_id not in generation_jobs:
        return jsonify({'error': 'Nem található ilyen folyamat'}), 404

    def event_stream():
        job = generation_jobs[job_id]
        queue = job['events']

        while True:
            event = queue.get()
            if event is None:
                break
            yield f"data: {json.dumps(event)}\n\n"

    return Response(event_stream(), mimetype="text/event-stream")

@app.route('/download/<filename>')
def download_file(filename):
    filepath = os.path.join(app.config['DOWNLOAD_FOLDER'], filename)
    if os.path.exists(filepath):
        return send_file(filepath, as_attachment=True, download_name="keszult_cikkek.docx")
    return "Fájl nem található", 404

# ==========================================
# ÚTVONALAK – PIPELINE & TONE GUIDE
# ==========================================
@app.route('/pipeline', methods=['GET'])
def get_pipeline():
    data = load_pipeline_data()
    return jsonify(data)

@app.route('/pipeline', methods=['POST'])
def update_pipeline():
    data = request.json
    steps = data.get('steps', [])
    if not steps:
        return jsonify({'error': 'A pipeline nem lehet üres'}), 400
    
    save_pipeline_data(steps)
    return jsonify({'success': True, 'message': 'Pipeline sikeresen mentve'})

@app.route('/pipeline/versions', methods=['GET'])
def get_pipeline_versions():
    data = load_pipeline_data()
    return jsonify({
        'versions': data.get('versions', [])
    })

@app.route('/pipeline/restore/<int:version_number>', methods=['POST'])
def restore_pipeline_version(version_number):
    data = load_pipeline_data()
    versions = data.get('versions', [])
    
    target = next((v for v in versions if v['version'] == version_number), None)
    if not target:
        return jsonify({'error': f'Nem található {version_number}. verzió'}), 404
        
    save_pipeline_data(target['steps'])
    return jsonify({'success': True, 'message': f'{version_number}. verzió visszaállítva'})

@app.route('/prompts/tone_guide', methods=['GET'])
def get_tone_guide_route():
    return jsonify({'text': load_tone_guide()})

@app.route('/prompts/tone_guide', methods=['POST'])
def update_tone_guide():
    data = request.json
    new_text = data.get('text', '').strip()
    if not new_text:
        return jsonify({'error': 'A tone guide nem lehet üres'}), 400
    
    save_tone_guide(new_text)
    return jsonify({'success': True, 'message': 'Tone guide mentve'})

@app.route('/variables', methods=['GET'])
def get_variables():
    variables = {
        "Excel változók": {
            "{ceg_url}": "A cég honlapjának URL-je",
            "{cikk_cim}": "A cikk H1 címe",
            "{link_N_kulcsszo}": "Belső link kulcsszava (N = 1-5)",
            "{link_N_url}": "Belső link URL-je (N = 1-5)",
            "{korabbi_cikk_url_N}": "Korábbi cikk URL-je (N = 1-2)",
            "{megjegyzes}": "Egyéb instrukció az Excelből"
        },
        "Generált változók": {
            "{linkek_felsorolasa}": "Automatikus lista a megadott linkekből Markdown formátumban",
            "{opcionalis_korabbi_cikkek_blokk}": "Korábbi cikkek hivatkozási instrukciója (ha van)",
            "{megjegyzes_blokk}": "Megjegyzés instrukció (ha van)",
            "{elvart_linkek}": "A megadott kulcsszavak listája ellenőrzéshez"
        },
        "Rendszer változók": {
            "{tone_guide}": "A Tone Guide teljes szövege",
            "{aktualis_cikk}": "Az utolsó generáló/javító lépés kimenete (ez lesz a végső cikk)",
            "{elozo_kimenet}": "A közvetlenül előző lépés teljes GPT válasza",
            "{lepes_N_kimenet}": "Az N. azonosítójú lépés GPT válasza",
            "{javitasi_problemak}": "A check lépések által talált hibák listája (csak fix lépésben hasznos)"
        }
    }
    return jsonify(variables)

# ==========================================
# INDÍTÁS
# ==========================================
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
