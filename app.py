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

# Biztosítjuk, hogy a mappák létezzenek
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
os.makedirs(app.config['DOWNLOAD_FOLDER'], exist_ok=True)
os.makedirs(app.config['PROMPTS_FOLDER'], exist_ok=True)

# WordPress iframe támogatás
@app.after_request
def add_header(response):
    response.headers['X-Frame-Options'] = 'ALLOWALL'
    response.headers['Access-Control-Allow-Origin'] = '*'
    return response

# OpenAI kliens
try:
    client = OpenAI()
except Exception as e:
    print(f"Figyelem: OpenAI kliens inicializálási hiba: {e}")
    client = None

# Választható modellek
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

# Tiltott fordulatok
FORBIDDEN_PHRASES = [
    "Az oldal szerint", "A leírás szerint", "Ez nem bénázás",
    "Tapasztalatból mondom", "ez nem csak", "talán", "nagyjából", "bizonyos értelemben"
]

# Állapotkezelés a generálásokhoz
generation_jobs = {}

# ==========================================
# PROMPT ALAPÉRTÉKEK
# ==========================================
DEFAULT_MAIN_PROMPT = """Te egy senior SEO-szövegíró és tartalomstratéga vagy. Magyarul írsz, természetesen, marketing-szag nélkül, de konverzióra optimalizálva.
Írj egy minőségi, keresőoptimalizált blogcikket a következő szolgáltatás oldal támogatására, és organikus forgalom + érdeklődők szerzésére.

Cég honlapjának url-je: {ceg_url}
Cikk címe: {cikk_cim}

Helyezz el rajta linkeket az alábbi kulcsszavakról az adott oldalakra, összesen {link_db} link legyen egy cikkben, a linkbe semmiképp ne illessz utm paramétert (Markdown formátumban illeszd be a linkeket a szövegbe):
{linkek_felsorolasa}

{opcionalis_korabbi_cikkek_blokk}

Követelmények a cikkhez
Nyelv: magyar
Terjedelem: 600-1000 szó
Stílus: közérthető, szakmai, bizalomépítő, gyakorlati példákkal.
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

Stílus részletesen:
- Hang: félformális, közvetlen, társalgóan szakmai. Nem laza, de nem merev.
- Persona: szakértő tanácsadó + türelmes magyarázó. Kompetens vezető, józan eligazító.
- Cél: tisztázni, bizonytalanságot csökkenteni, szakértői hitelességet építeni, majd óvatosan konverzióba terelni.
- Szerkezet: helyzet/probléma → miért fontos → mikor/miért/hogyan bontás → gyakorlati szempontok → összegzés → finom szolgáltatói említés.
- Nyitás: az olvasó aktuális bizonytalanságára csatlakozzon rá (hétköznapi helyzet + kérdés, vagy látszat vs valóság kontraszt).
- Lezárás: összegzés + soft CTA ("ha szeretnéd", "érdemes megnézni").
- Mondatok: rövid vagy közepes hosszú; átvezetők: Ezért, Vagyis, Például, Röviden, A lényeg.
- Bekezdések: 1-3 mondatos blokkok, scan-first logika.
- Alcímek: kérdés- vagy előnyközpontúak (Miért fontos…, Mikor érdemes…, Hogyan történik…).
- Felkiáltójel: szinte ne legyen.
- Hitelességet konkrétumokkal építsd, ne önfényezéssel.{megjegyzes_blokk}"""

DEFAULT_FIX_PROMPT = """Az alábbi cikket kérlek javítsd ki a megjelölt problémák alapján. Csak a teljes javított cikket add vissza, semmi mást.

Problémák:
{hibak_felsorolasa}

Eredeti cikk:
{eredeti_cikk}"""

DEFAULT_FACT_CHECK_PROMPT = """Az alábbi cikket ellenőrizd le: tartalmaz-e olyan konkrét állítást a cégről, amely nem ellenőrizhető a cég honlapjáról ({ceg_url}), vagy nyilvánvalóan kitalált/valótlan? Csak akkor jelezz problémát, ha egyértelmű kitalált állítás van. Válaszolj így: "OK" ha nincs probléma, vagy "JAVÍTANDÓ: [probléma rövid leírása]" ha van.

Cikk:
{cikk_szovege}"""

# ==========================================
# PROMPT FÁJLRENDSZER
# ==========================================
PROMPT_FILES = {
    'main': 'main_prompt.json',
    'fix': 'fix_prompt.json',
    'fact_check': 'fact_check_prompt.json',
}

PROMPT_DEFAULTS = {
    'main': DEFAULT_MAIN_PROMPT,
    'fix': DEFAULT_FIX_PROMPT,
    'fact_check': DEFAULT_FACT_CHECK_PROMPT,
}

def get_prompt_path(prompt_name):
    return os.path.join(app.config['PROMPTS_FOLDER'], PROMPT_FILES[prompt_name])

def load_prompt(prompt_name):
    """Betölti a prompt aktuális szövegét a JSON fájlból."""
    path = get_prompt_path(prompt_name)
    if os.path.exists(path):
        with open(path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return data.get('current', PROMPT_DEFAULTS[prompt_name])
    return PROMPT_DEFAULTS[prompt_name]

def load_prompt_data(prompt_name):
    """Betölti a teljes prompt JSON adatot (current + versions)."""
    path = get_prompt_path(prompt_name)
    if os.path.exists(path):
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {'current': PROMPT_DEFAULTS[prompt_name], 'versions': []}

def save_prompt(prompt_name, new_text):
    """Elmenti az új prompt szöveget, a régit verzióba teszi."""
    path = get_prompt_path(prompt_name)
    data = load_prompt_data(prompt_name)

    old_text = data.get('current', '')
    versions = data.get('versions', [])
    next_version = len(versions) + 1

    if old_text:
        versions.append({
            'version': next_version,
            'text': old_text,
            'saved_at': datetime.now().isoformat(timespec='seconds')
        })

    data['current'] = new_text
    data['versions'] = versions

    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def init_prompts():
    """Inicializálja a prompt JSON fájlokat, ha még nem léteznek."""
    for name, default_text in PROMPT_DEFAULTS.items():
        path = get_prompt_path(name)
        if not os.path.exists(path):
            data = {
                'current': default_text,
                'versions': [
                    {
                        'version': 1,
                        'text': default_text,
                        'saved_at': datetime.now().isoformat(timespec='seconds')
                    }
                ]
            }
            with open(path, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)

# Indításkor inicializálás
init_prompts()

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
# CIKK GENERÁLÓ LOGIKA
# ==========================================
def validate_article(text, keywords):
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

def check_facts(article_text, ceg_url, model):
    """Tényellenőrzés a fact_check prompt alapján."""
    fact_check_template = load_prompt('fact_check')
    prompt = fact_check_template.format(
        ceg_url=ceg_url,
        cikk_szovege=article_text
    )

    try:
        response = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        return "OK"

def generate_single_article(row_data, job_id, row_index, model):
    ceg_url = row_data.get('ceg_url', '')
    cikk_cim = row_data.get('cikk_cim', '')
    megjegyzes = row_data.get('megjegyzes', '')

    links = []
    keywords = []

    for i in range(1, 6):
        kw = row_data.get(f'link_{i}_kulcsszo', '')
        url = row_data.get(f'link_{i}_url', '')

        if kw and url:
            links.append(f"- [{kw}]({url})")
            keywords.append(kw)

    linkek_felsorolasa = "\n".join(links)

    korabbi_cikkek = []
    for i in range(1, 3):
        url = row_data.get(f'korabbi_cikk_url_{i}', '')
        if url:
            korabbi_cikkek.append(f"- {url}")

    opcionalis_korabbi_cikkek_blokk = ""
    if korabbi_cikkek:
        opcionalis_korabbi_cikkek_blokk = (
            "Kérlek, helyezz el természetes hivatkozást a következő korábbi cikk(ek)re is "
            "(a megfelelő kontextusban):\n" + "\n".join(korabbi_cikkek)
        )

    megjegyzes_blokk = f"\nEgyéb instrukciók ehhez a cikkhez:\n{megjegyzes}" if megjegyzes else ""

    # Fő prompt betöltése és kitöltése
    main_prompt_template = load_prompt('main')
    prompt = main_prompt_template.format(
        ceg_url=ceg_url,
        cikk_cim=cikk_cim,
        link_db=len(links),
        linkek_felsorolasa=linkek_felsorolasa,
        opcionalis_korabbi_cikkek_blokk=opcionalis_korabbi_cikkek_blokk,
        megjegyzes_blokk=megjegyzes_blokk
    )

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

    update_status('Folyamatban', 'Generálás indítása...')

    try:
        response = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7
        )
        article_text = response.choices[0].message.content.strip()
    except Exception as e:
        update_status('Hiba', f'API hiba: {str(e)}')
        return None

    # Ellenőrzési és javítási ciklus (max 2 kör)
    for javitas_kor in range(2):
        errors = validate_article(article_text, keywords)

        fact_check_result = check_facts(article_text, ceg_url, model)
        if fact_check_result.startswith("JAVÍTANDÓ:"):
            errors.append(f"Tényellenőrzési hiba: {fact_check_result[10:].strip()}")

        if not errors:
            if javitas_kor > 0:
                update_status('Kész', f'Javítva {javitas_kor}. körben')
            else:
                update_status('Kész', 'Sikeres generálás')
            return article_text

        update_status('Folyamatban', f'Javítás folyamatban ({javitas_kor+1}/2)... Hibák: {len(errors)}')

        # Javítási prompt betöltése és kitöltése
        fix_prompt_template = load_prompt('fix')
        javitasi_prompt = fix_prompt_template.format(
            hibak_felsorolasa="\n".join('- ' + e for e in errors),
            eredeti_cikk=article_text
        )

        try:
            response = client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": javitasi_prompt}],
                temperature=0.5
            )
            article_text = response.choices[0].message.content.strip()
        except Exception as e:
            update_status('Hiba', f'Javítási API hiba: {str(e)}')
            return None

    # Ha maradtak hibák 2 kör után is
    update_status('Hiba', 'Nem sikerült javítani a hibákat 2 kör alatt.')
    return article_text  # Visszaadjuk a részben hibásat is

def generation_worker(job_id):
    job = generation_jobs[job_id]
    rows = job['rows']
    model = job.get('model', DEFAULT_MODEL)

    doc = Document()
    sikeres_cikkek = 0

    for idx, row in enumerate(rows):
        if row.get('status') == 'Kész':
            continue  # Ha újraindítjuk, átugorjuk a kész cikkeket

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

        time.sleep(1)  # Rate limit védelem

    # Word mentése
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
    job['events'].put(None)  # Vége jelzés az SSE-nek

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

    # Modell validálása
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

    # Háttérszál indítása
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
# ÚTVONALAK – PROMPTOK
# ==========================================
@app.route('/prompts', methods=['GET'])
def get_prompts():
    """Visszaadja az összes prompt jelenlegi szövegét."""
    result = {}
    for name in PROMPT_FILES:
        result[name] = load_prompt(name)
    return jsonify(result)

@app.route('/prompts/<prompt_name>', methods=['POST'])
def update_prompt(prompt_name):
    """Elmenti az új prompt verziót."""
    if prompt_name not in PROMPT_FILES:
        return jsonify({'error': 'Ismeretlen prompt neve'}), 400

    data = request.json
    new_text = data.get('text', '').strip()

    if not new_text:
        return jsonify({'error': 'A prompt szövege nem lehet üres'}), 400

    save_prompt(prompt_name, new_text)
    return jsonify({'success': True, 'message': 'Prompt mentve'})

@app.route('/prompts/<prompt_name>/versions', methods=['GET'])
def get_prompt_versions(prompt_name):
    """Visszaadja a prompt verzióelőzményeit."""
    if prompt_name not in PROMPT_FILES:
        return jsonify({'error': 'Ismeretlen prompt neve'}), 400

    data = load_prompt_data(prompt_name)
    return jsonify({
        'current': data.get('current', ''),
        'versions': data.get('versions', [])
    })

@app.route('/prompts/<prompt_name>/restore/<int:version_number>', methods=['POST'])
def restore_prompt_version(prompt_name, version_number):
    """Visszaállít egy korábbi prompt verziót."""
    if prompt_name not in PROMPT_FILES:
        return jsonify({'error': 'Ismeretlen prompt neve'}), 400

    data = load_prompt_data(prompt_name)
    versions = data.get('versions', [])

    target = next((v for v in versions if v['version'] == version_number), None)
    if not target:
        return jsonify({'error': f'Nem található {version_number}. verzió'}), 404

    save_prompt(prompt_name, target['text'])
    return jsonify({'success': True, 'message': f'{version_number}. verzió visszaállítva'})

# ==========================================
# INDÍTÁS
# ==========================================
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
