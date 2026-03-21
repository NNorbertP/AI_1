# SEO Cikk Generáló Webalkalmazás

Ez a webalkalmazás a SEO cikk generáló szkript grafikus, böngészőből használható változata. Lehetővé teszi az Excel sablon feltöltését, a sorok szerkesztését, valós idejű folyamatjelzést a generálás során, és a kész Word dokumentum letöltését. Kifejezetten WordPress iframe-beágyazásra lett optimalizálva.

## Technikai Stack
- **Backend**: Python 3, Flask, OpenAI API, python-docx, pandas
- **Frontend**: HTML5, CSS3, Vanilla JavaScript, SSE (Server-Sent Events)

## Telepítés és futtatás szerveren

1. **Követelmények telepítése:**
   A szerveren lévő virtuális környezetben (vagy globálisan) futtasd:
   ```bash
   pip install -r requirements.txt
   ```

2. **Környezeti változók beállítása:**
   A rendszer az OpenAI API-t használja. Biztosítsd, hogy az `OPENAI_API_KEY` be legyen állítva:
   ```bash
   export OPENAI_API_KEY="sk-te-api-kulcsod"
   ```

3. **Alkalmazás indítása:**
   ```bash
   python app.py
   ```
   Az alkalmazás alapértelmezetten a `0.0.0.0:5000` porton indul el.

   *Éles környezetben ajánlott Gunicorn-t vagy uWSGI-t használni:*
   ```bash
   gunicorn -w 4 -b 0.0.0.0:5000 app:app
   ```

## WordPress Beágyazás (iframe)

Az alkalmazás úgy lett beállítva, hogy a fejlécben elküldi az `X-Frame-Options: ALLOWALL` és `Access-Control-Allow-Origin: *` értékeket, így bármilyen WordPress oldalba beágyazható.

1. Hozz létre egy új oldalt vagy bejegyzést a WordPress-ben.
2. Válts "Egyedi HTML" vagy "Szöveg" nézetre a szerkesztőben.
3. Illeszd be az alábbi kódot (cseréld ki a `https://a-te-szervered.hu:5000` részt a saját szervered URL-jére):

```html
<iframe 
  src="https://a-te-szervered.hu:5000" 
  width="100%" 
  height="900px" 
  style="border: none; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);" 
  allowfullscreen>
</iframe>
```

*Tipp: Ha a WordPress oldalad HTTPS-t használ (ami ajánlott), akkor a Flask szervernek is HTTPS-en keresztül kell elérhetőnek lennie (pl. Nginx reverse proxy mögé téve).*

## Működés röviden
1. **Feltöltés:** A felhasználó feltölti a `.xlsx` sablont. A backend `pandas`-szal beolvassa és JSON formátumban visszaküldi a frontendnek.
2. **Szerkesztés:** A frontend egy inline szerkeszthető táblázatot rajzol ki. Új sorok adhatók hozzá, meglévők törölhetők.
3. **Generálás:** A "Generálás indítása" gombra kattintva a backend egy háttérszálat indít.
4. **SSE (Server-Sent Events):** A frontend egy `/stream/<job_id>` végponton keresztül valós időben kapja a státuszfrissítéseket (pl. melyik cikk tart épp hol, van-e hiba).
5. **Letöltés:** Ha minden cikk kész, a backend legenerálja a `.docx` fájlt, és a frontend megjeleníti a letöltés gombot.
