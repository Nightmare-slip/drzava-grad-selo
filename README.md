# Država, grad, selo — igra za društvo

Mobilna web-igrica za do 10 igrača u jednoj sobi. Projekat koristi React + Vite (frontend), Supabase (baza, anonimna prijava i realtime) i Cloudflare Pages (besplatan hosting).

## Šta je uključeno

- Profil sa imenom i četverocifrenim PIN-om; prijava na drugom uređaju imenom + PIN-om.
- Kreiranje sobe sa nasumičnim četverocifrenim kodom i pridruživanje kodom.
- Admin pokreće rundu; svim igračima se prikazuje isto nasumično slovo.
- Odbrojavanje 2:00, sedam kategorija: država, grad, selo, rijeka, biljka, ime, predmet.
- Predaja odgovora i pregled kategoriju po kategoriju.
- Glasanje za tuđe odgovore; više glasova „netačno” nego „tačno” daje 0 bodova.
- Bodovanje: jedinstven odgovor 20; isti odgovor kod svih igrača u sobi 10; ponovljen odgovor kod dijela igrača 5.
- Dugme DALJE čeka da svi igrači potvrde; admin može završiti igru ranije.
- Konačna rang-lista od najviše do najmanje bodova.

## Važna napomena o bodovanju / glasanju

Ova prva verzija koristi jednostavno većinsko glasanje među glasovima koji su stvarno dati: ako je više glasova „netačno” nego „tačno”, odgovor dobija 0. Ako niko ne glasa, odgovor se prihvata. Kod bodovanja, identični odgovori se porede bez obzira na velika/mala slova. Ako odgovor nije unesen, igrač ne dobija bodove za tu kategoriju.

## 1. Napravi besplatnu Supabase bazu

1. Otvori https://supabase.com/ i napravi besplatan nalog.
2. Klikni **New project**, izaberi organizaciju, naziv npr. `dgs-drustvo`, jaku database lozinku i region blizu tebe.
3. Sačekaj da se projekat napravi.
4. Otvori **Authentication → Sign In / Providers** i uključi **Anonymous sign-ins** (ako nije već uključeno).\n5. Otvori **SQL Editor** → **New query**.
5. Otvori fajl `supabase/schema.sql` iz ovog projekta, kopiraj cijeli sadržaj, zalijepi u SQL Editor i klikni **Run**.
6. U Supabase otvori **Project Settings → API** (ili **Data API**) i kopiraj:
   - Project URL
   - anon / publishable public key (nikad `service_role` / secret key)

## 2. Poveži aplikaciju sa Supabase

1. Raspakuj ZIP na računaru.
2. U glavnom folderu kopiraj `.env.example` i preimenuj kopiju u `.env`.
3. U `.env` upiši vrijednosti iz Supabase:

   `VITE_SUPABASE_URL=https://...supabase.co`

   `VITE_SUPABASE_ANON_KEY=...`

4. Sačuvaj fajl. Ne šalji nikome `service_role` key i nemoj ga stavljati u `.env` za frontend.

## 3. Testiraj na računaru

Potrebno je instalirati Node.js LTS: https://nodejs.org/

U folderu projekta otvori Terminal / PowerShell i pokreni:

```bash
npm install
npm run dev
```

Terminal će prikazati lokalni link (obično `http://localhost:5173`). Otvori ga u browseru. Za testiranje sa više telefona koristi javni deploy link iz koraka 4.

## 4. Objavi besplatno na internetu preko Cloudflare Pages

Najlakše je preko GitHub-a:

1. Napravi nalog na https://github.com/ .
2. Klikni **New repository**, npr. `drzava-grad-selo`. Može biti Private.
3. Uploaduj sadržaj raspakovanog foldera (uključujući `src`, `supabase`, `package.json`, `index.html`, `vite.config.js` ako postoji; `.env` NEMOJ uploadovati).
4. Otvori https://dash.cloudflare.com/ i napravi besplatan nalog.
5. Izaberi **Workers & Pages → Create → Pages → Connect to Git**.
6. Izaberi GitHub repo.
7. Build settings:
   - Framework preset: **Vite**
   - Build command: `npm run build`
   - Build output directory: `dist`
8. U **Environment variables** dodaj:
   - `VITE_SUPABASE_URL` = tvoj Supabase Project URL
   - `VITE_SUPABASE_ANON_KEY` = tvoj anon/publishable key
9. Klikni **Save and Deploy**. Dobićeš adresu tipa `https://ime-projekta.pages.dev`.
10. Otvori tu adresu na telefonima. Pošalji link društvu.

## 5. Besplatni planovi i ograničenja

Supabase Free uključuje bazu i Realtime, ali projekat može biti pauziran nakon sedam dana neaktivnosti. Za ovu igru sa prijateljima je obično dovoljno; ako se baza uspava, otvori Supabase dashboard i probudi projekat. Cloudflare Pages ima besplatan plan za statičko hostovanje.

## 6. Pravila igre u ovoj verziji

- Admin klikne **Pokreni igru**.
- Svi dobiju isto nasumično slovo i 120 sekundi.
- Igrač unosi sedam odgovora i klikne **Predaj odgovore**.
- Kada istekne vrijeme, admin može završiti rundu; automatski se završava kada adminov ekran odbroji do nule.
- U pregledu se prikazuje trenutna kategorija. Igrači glasaju za odgovore drugih igrača.
- Svaki igrač klikne **Dalje**; kada svi potvrde, otvara se naredna kategorija.
- Admin može kliknuti **Završi igru** u bilo kojoj fazi pregleda.
- Rezultati se sabiraju i prikazuju rang-listom.

## Ograničenja prve verzije

- PIN od četiri cifre je zgodan za neformalnu igru, ali nije jaka zaštita. Nemoj koristiti pravo ime + PIN koji koristiš na drugim servisima.
- Glasanje i kontrola admina su namijenjeni društvenoj igri, ne takmičenju sa nagradama; za javnu/ozbiljnu upotrebu treba dodatno učvrstiti server-side provjere i pravila baze.
- Adminov browser mora ostati otvoren tokom runde zbog odbrojavanja u ovoj jednostavnoj verziji.
- U ovoj prvoj verziji igrači koji nisu predali odgovore prije kraja runde ne mogu predati naknadno.
- Za prvo testiranje napravi sobu sa 2–3 telefona i provjeri cijeli tok prije nego pošalješ link svima.

## Fajlovi

- `src/main.jsx` — interfejs i logika igre
- `src/style.css` — mobilni dizajn
- `supabase/schema.sql` — tabele, PIN funkcije, dozvole i realtime
- `.env.example` — primjer podešavanja
