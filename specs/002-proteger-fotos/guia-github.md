# Guia de pasos manuales en GitHub y Vercel · Spec 002

Para Javi. Se hace **despues** de que la parte local este verificada (CA1 a CA8 en verde). Va en orden, y se puede parar entre bloques sin dejar nada roto. Cada paso tiene su comprobacion: si no sale lo esperado, **para ahi** y avisa a Claude.

`P` = repo privado (el actual, una vez renombrado). `E` = repo espejo publico (nuevo).

---

## Bloque 0 · Antes de tocar nada

- [ ] **0.1 Forks.** Abre `github.com/javisuu/javisu-photography-portfolio/forks`, o Insights → Forks.
  - Comprueba: anota cuantos hay. Si hay alguno ajeno, avisa: al pasar a privado se independiza y conserva las fotos.
- [ ] **0.2 Revisar lo que va a salir a produccion.** La rama aun no esta en GitHub, asi que Vercel no tiene preview de ella. Hay dos opciones:
  - (a) en local: `npm run dev` y abrir `http://localhost:3000`;
  - (b) pedir a Claude un push de la rama `feat/002-proteger-fotos` (lo autorizas tu) y abrir su preview en vercel.com → Deployments.
  - Comprueba: la web carga con fotos, landing, albumes y atlas. **Es lo que pasara a produccion** al fusionar.

## Bloque 1 · Fusionar en `main` (con Claude)

- [ ] **1.1** Dile a Claude: "fusiona en main". Es una fusion fast-forward en local.
- [ ] **1.2** Dile a Claude: "push de main". Este push lo autorizas tu expresamente. Despliega en produccion.
  - Comprueba: la URL de produccion de Vercel muestra la web nueva.
  - Comprueba: la pestana Actions puede mostrar el workflow "mirror" **saltado** (skipped). Es correcto: la guarda `if` aun no coincide, porque el repo todavia no se ha renombrado.

## Bloque 2 · Renombrar y privatizar este repo

- [ ] **2.1 Renombrar.** `github.com/javisuu/javisu-photography-portfolio` → Settings → General → Repository name → `javisu-photography-portfolio-private` → Rename.
- [ ] **2.2 Remoto local.** Dile a Claude: "actualiza el remoto" (`git remote set-url origin https://github.com/javisuu/javisu-photography-portfolio-private.git`).
  - Comprueba: `git remote -v` muestra el nombre nuevo.
- [ ] **2.3 Vercel sigue conectado.** vercel.com → proyecto → Settings → Git.
  - Comprueba: el repo conectado es `javisu-photography-portfolio-private`. Si no, pulsa "Disconnect" → "Connect" y eligelo.
- [ ] **2.4 Privatizar.** Settings → General → Danger Zone → Change repository visibility → Make private → confirma escribiendo el nombre.
  - Comprueba: en una ventana de incognito, `github.com/javisuu/javisu-photography-portfolio-private` da 404.
  - Comprueba: la web de produccion sigue cargando.

## Bloque 3 · Crear el espejo

- [ ] **3.1** github.com → New repository → Owner `javisuu`, nombre `javisu-photography-portfolio`, **Public**. **No** marques README, .gitignore ni licencia: tiene que nacer vacio.
  - Comprueba: el repo existe y dice "Quick setup", es decir, que esta vacio.

## Bloque 4 · Deploy key (permite a la Action escribir en el espejo)

Hazlo en una terminal **fuera de la carpeta del proyecto**, por ejemplo en el Escritorio.

- [ ] **4.1 Generar el par de claves:**
  ```
  ssh-keygen -t ed25519 -C "mirror-deploy" -f mirror_key -N ""
  ```
  Salen dos ficheros: `mirror_key` (privada) y `mirror_key.pub` (publica).
- [ ] **4.2 Clave publica → espejo.** `github.com/javisuu/javisu-photography-portfolio` → Settings → Deploy keys → Add deploy key.
  - Title: `mirror from private`.
  - Key: pega el contenido de `mirror_key.pub`.
  - **Marca "Allow write access".**
  - Comprueba: aparece en la lista con "Read/write".
- [ ] **4.3 Clave privada → secret del privado.** `github.com/javisuu/javisu-photography-portfolio-private` → Settings → Secrets and variables → Actions → New repository secret.
  - Name: `MIRROR_DEPLOY_KEY`.
  - Secret: pega el contenido **completo** de `mirror_key`, incluidas las lineas `-----BEGIN` y `-----END`.
  - Comprueba: aparece `MIRROR_DEPLOY_KEY` en la lista.
- [ ] **4.4 Borrar las claves del disco.** Borra `mirror_key` y `mirror_key.pub`. Ya estan en GitHub y no hacen falta en local.

## Bloque 5 · Primer espejo y verificacion

- [ ] **5.1** Pide a Claude que relance el workflow ("relanza el espejo"), o lanzalo tu: Actions → mirror → Run workflow.
  - Comprueba: el workflow termina en verde.
- [ ] **5.2** Abre `github.com/javisuu/javisu-photography-portfolio` en incognito.
  - Comprueba: estan el codigo, el README y la LICENSE, y **no** existen las carpetas `public/photos/` ni `docs/referencias/`.
- [ ] **5.3** Dile a Claude: "verifica el espejo". Ejecuta CA9 a CA12 (el hash coincide, el historial no tiene fotos, produccion carga y el nombre original lleva al espejo).
- [ ] **5.4** El enlace "GitHub repository" de `/credits` en produccion abre el espejo.

---

**Si algo falla:** nada de esto borra el repo privado ni su historial. El nombre y la visibilidad se pueden devolver desde Settings, y el espejo y la deploy key se pueden borrar y crear de nuevo.
