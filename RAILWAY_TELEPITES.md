# SEO Cikk Generáló Webalkalmazás - Railway.app Telepítési Útmutató

Ez az útmutató lépésről lépésre bemutatja, hogyan tudod a SEO Cikk Generáló Flask webalkalmazást ingyenesen telepíteni a [Railway.app](https://railway.app/) felhőszolgáltatásba, és hogyan tudod azt beágyazni a WordPress weboldaladba.

---

## 1. Fiók létrehozása és GitHub előkészületek

1. Nyisd meg a böngésződben a [GitHub](https://github.com/) weboldalát, és hozz létre egy ingyenes fiókot (ha még nincs).
2. Hozz létre egy új, **privát** repozitóriumot (Repository) a GitHub-on (pl. `seo-cikk-generalo` néven).
3. Töltsd fel a gépdre kicsomagolt `seo_webapp` mappa **tartalmát** ebbe a GitHub repozitóriumba. Fontos, hogy a fájlok (pl. `app.py`, `requirements.txt`, `railway.json`) közvetlenül a repozitórium gyökerében legyenek, ne egy almappában.
4. Nyisd meg a [Railway.app](https://railway.app/) weboldalát.
5. Kattints a jobb felső sarokban a **"Login"** gombra, majd válaszd a **"Login with GitHub"** lehetőséget. Fogadd el az engedélyeket, amiket a Railway kér a GitHub fiókodhoz.

---

## 2. Új projekt létrehozása a Railway-en

1. A Railway Dashboard-on (vezérlőpulton) kattints a nagy **"New Project"** gombra.
2. A felugró menüből válaszd a **"Deploy from GitHub repo"** opciót.
3. Ha még nem adtál hozzáférést a Railway-nek a repozitóriumaidhoz, kattints a "Configure GitHub app" gombra, és engedélyezd a hozzáférést az imént létrehozott `seo-cikk-generalo` repóhoz.
4. Válaszd ki a listából a `seo-cikk-generalo` repozitóriumot.
5. A következő ablakban kattints az **"Add Variables"** (Változók hozzáadása) gombra. (Ne kattints még a Deploy-ra!)

---

## 3. Környezeti változók (API kulcs) beállítása

Az alkalmazásnak szüksége van az OpenAI API kulcsodra a cikkek generálásához. Ezt biztonságosan, környezeti változóként kell megadni.

1. A projekt beállításainál keresd meg a **"Variables"** (Változók) fület.
2. Kattints a **"New Variable"** gombra.
3. A **VARIABLE_NAME** mezőbe írd be pontosan ezt (csupa nagybetűvel):
   `OPENAI_API_KEY`
4. A **VALUE** mezőbe másold be a saját OpenAI API kulcsodat (pl. `sk-proj-...`).
5. Kattints az **"Add"** gombra.
6. A változó hozzáadása után a Railway automatikusan elindítja a telepítést (Deploy). Ha nem tenné, kattints a lila **"Deploy"** gombra.

---

## 4. A nyilvános URL megszerzése

Hogy az alkalmazásod elérhető legyen az interneten (és beágyazható legyen a WordPress-be), egy nyilvános domain névre van szükség.

1. Kattints az alkalmazásod blokkjára a Railway Dashboard-on.
2. Lépj a **"Settings"** (Beállítások) fülre.
3. Görgess le az **"Environment"** szekcióhoz, majd a **"Domains"** részhez.
4. Kattints a **"Generate Domain"** gombra.
5. A Railway létrehoz egy egyedi, biztonságos (HTTPS) URL-t (pl. `seo-cikk-generalo-production.up.railway.app`).
6. **Másold ki ezt az URL-t**, mert erre lesz szükséged a WordPress beágyazáshoz!

*Megjegyzés: A telepítés (Build és Deploy folyamat) eltarthat 2-3 percig. A "Deployments" fülön követheted nyomon a folyamatot. Amikor zöld "Success" feliratot látsz, az alkalmazásod él és működik.*

---

## 5. WordPress beágyazás (iframe)

Az alkalmazás úgy lett beállítva, hogy biztonságosan beágyazható legyen bármilyen weboldalba iframe segítségével.

### Gutenberg szerkesztő (Alapértelmezett WordPress szerkesztő) esetén:
1. Nyisd meg szerkesztésre azt az oldalt vagy bejegyzést, ahova az alkalmazást tenni szeretnéd.
2. Kattints a **"+"** (Blokk hozzáadása) gombra.
3. Keress rá az **"Egyedi HTML"** (Custom HTML) blokkra, és add hozzá az oldalhoz.
4. Illeszd be a következő kódot a blokkba (cseréld ki a `SAJAT_RAILWAY_URL` részt a 4. lépésben kimásolt URL-re):

```html
<iframe 
  src="https://SAJAT_RAILWAY_URL" 
  width="100%" 
  height="900px" 
  style="border: none; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);" 
  allowfullscreen>
</iframe>
```

### Elementor esetén:
1. Nyisd meg az oldalt az Elementor szerkesztővel.
2. Keress rá a bal oldali panelen a **"HTML"** widgetre.
3. Húzd be a HTML widgetet a kívánt oszlopba.
4. A bal oldali szerkesztőmezőbe illeszd be a fenti `<iframe>` kódot (ne felejtsd el kicserélni az URL-t).

### Egyszerű HTML / Szöveg widget esetén:
Ha a klasszikus szerkesztőt vagy egy oldalsáv widgetet használsz, egyszerűen válts "Szöveg" (Text) nézetre, és illeszd be a fenti `<iframe>` kódot.

---

## 6. Az "elalvás" problémájának kezelése (UptimeRobot)

Az ingyenes felhőszolgáltatások (mint a Railway ingyenes csomagja) gyakran "elaltatják" az alkalmazást, ha egy ideig senki sem használja. Ilyenkor az első betöltés nagyon lassú lehet (akár 30-60 másodperc), amíg a szerver újra felébred. Ezt elkerülheted az ingyenes UptimeRobot szolgáltatással.

1. Regisztrálj egy ingyenes fiókot az [UptimeRobot](https://uptimerobot.com/) oldalán.
2. Belépés után kattints az **"Add New Monitor"** gombra.
3. A **Monitor Type** legyen: `HTTP(s)`.
4. A **Friendly Name** mezőbe írj be egy tetszőleges nevet (pl. `SEO Generáló Ébrentartó`).
5. Az **URL (or IP)** mezőbe másold be a Railway-en kapott nyilvános domainedet (pl. `https://seo-cikk-generalo-production.up.railway.app`).
6. A **Monitoring Interval** értéket hagyd 5 percen.
7. Kattints a **"Create Monitor"** gombra.

Kész! Az UptimeRobot mostantól 5 percenként "megpingeli" az alkalmazásodat, így az sosem fog elaludni, és a WordPress oldaladon mindig azonnal, gyorsan be fog tölteni a generáló felület.
