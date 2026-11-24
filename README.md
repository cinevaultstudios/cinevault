
# CineVault

**A Premium Movie Discovery Platform**

CineVault is an independent movie discovery website built with HTML, CSS, JavaScript, Cloudflare Workers and Cloudflare D1.

It provides a premium cinematic interface for discovering movies, browsing curated collections, viewing movie details and managing website content through a protected administration dashboard.

---

## Features

### Public Website

- Premium Black & Gold cinematic design.
- Responsive desktop, tablet and mobile layout.
- Dynamic movie catalogue powered by Cloudflare D1.
- Movie search by title, genre, language, country, director and description.
- Genre, language, year and minimum-rating filters.
- Movie sorting options.
- Homepage pagination with 40 movies per page.
- Dynamic movie details using movie ID or slug.
- Similar movie recommendations.
- Dynamic homepage hero content.
- Dynamic movie collections.
- Personal watchlist using browser Local Storage.
- External watch and download destinations.
- About, Privacy Policy and Terms pages.

### Admin Dashboard

Access the administration dashboard at:

`/admin.html`

Current administration features:

- Secure administrator login and logout.
- Session authentication.
- Movie listing and management.
- Add, edit and delete movies.
- Movie search and sorting.
- Movie poster and backdrop management.
- Cloudinary image uploads.
- Movie description and metadata management.
- Watch URL configuration.
- Two separate download URL fields.
- Per-movie advertisement URL field.
- Per-movie advertisement count configuration.
- Website name and logo text settings.
- Homepage hero banner settings.
- Homepage section text and link settings.
- Collection creation, editing and deletion.
- Collection image, icon, genre and ordering settings.
- Collection activation and deactivation.

**Important:** Advertisement URL and advertisement count are stored as movie configuration fields. A verified repeated-ad download gate is not currently implemented.

---

## Technology Stack

| Technology | Purpose |
|---|---|
| HTML5 | Website structure |
| CSS3 | Design and responsive layout |
| JavaScript | Frontend application |
| Cloudflare Workers | Backend API |
| Cloudflare D1 | SQLite database |
| Cloudflare Assets | Static website files |
| Cloudinary | Image hosting and uploads |
| GitHub | Source code repository |
| Wrangler | Cloudflare deployment and management |

---

## Project Structure

```text
cinevault-website/
│
├── index.html
├── movie.html
├── admin.html
│
├── about.html
├── privacy.html
├── terms.html
│
├── style.css
├── script.js
├── movies.js
│
├── schema.sql
├── wrangler.jsonc
├── README.md
│
└── src/
    └── index.js
```

### File Responsibilities

| File | Description |
|---|---|
| `index.html` | Homepage structure |
| `movie.html` | Individual movie details page |
| `admin.html` | Administration dashboard |
| `style.css` | Main website styles |
| `script.js` | Homepage application logic |
| `movies.js` | Legacy static movie catalogue |
| `src/index.js` | Cloudflare Worker backend |
| `schema.sql` | Initial D1 database schema |
| `wrangler.jsonc` | Cloudflare Worker configuration |
| `about.html` | About CineVault |
| `privacy.html` | Privacy Policy |
| `terms.html` | Terms and Conditions |

The current homepage retrieves movie data from the D1-backed API. `movies.js` is retained as a legacy file and is not the current homepage data source.

---

## Architecture

```text
                 VISITOR
                    |
                    v
              CINEVAULT WEBSITE
                    |
          +---------+---------+
          |                   |
          v                   v
      Homepage            Movie Details
          |                   |
          +---------+---------+
                    |
                    v
             CLOUDFLARE WORKER
                    |
          +---------+---------+
          |                   |
          v                   v
       D1 DATABASE       CLOUDFLARE ASSETS
          |
          v
    Movies / Collections
      / Site Settings


             ADMIN DASHBOARD
                    |
                    v
             ADMIN API
                    |
          +---------+---------+
          |                   |
          v                   v
       D1 DATABASE        CLOUDINARY
                          Image Storage
```

---

## Database

CineVault uses Cloudflare D1, based on SQLite.

### Database Tables

#### 1. movies

Stores movie information:

- id
- title
- slug
- description
- poster
- backdrop
- year
- genre
- rating
- duration
- language
- country
- director
- quality
- featured
- download_url
- download_url_2
- watch_url
- ad_url
- ad_count
- created_at
- updated_at

#### 2. collections

Stores homepage movie collections:

- id
- name
- description
- image
- icon
- genre
- link_url
- sort_order
- is_active
- created_at
- updated_at

#### 3. site_settings

Stores supported website settings as key-value records.

---

## API Endpoints

### Public API

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/hello` | API health check |
| GET | `/api/settings` | Retrieve website settings |
| GET | `/api/collections` | Retrieve active collections |
| GET | `/api/movies` | Retrieve movie catalogue |
| GET | `/api/movies/:id` | Retrieve movie by ID |
| GET | `/api/movies/:slug` | Retrieve movie by slug |

### Movie Query Parameters

The movie listing API supports:

- `q` — Search term
- `genre` — Genre filter
- `language` — Language filter
- `year` — Release year
- `minRating` — Minimum rating
- `sort` — Sorting method
- `page` — Page number
- `limit` — Results per page

Supported sorting values:

- `newest`
- `oldest`
- `rating`
- `az`
- `za`
- `year`

The API supports a maximum page size of 100.

The homepage currently displays 40 movies per page.

### Admin API

All administration endpoints require an authenticated administrator session, except the login and session-check routes.

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/admin/login` | Administrator login |
| POST | `/api/admin/logout` | Administrator logout |
| GET | `/api/admin/session` | Check authentication |
| GET | `/api/admin/movies` | List movies |
| POST | `/api/admin/movies` | Add movie |
| PUT | `/api/admin/movies/:id` | Update movie |
| DELETE | `/api/admin/movies/:id` | Delete movie |
| GET | `/api/admin/collections` | List collections |
| POST | `/api/admin/collections` | Add collection |
| PUT | `/api/admin/collections/:id` | Update collection |
| DELETE | `/api/admin/collections/:id` | Delete collection |
| GET | `/api/admin/settings` | Retrieve settings |
| PUT | `/api/admin/settings` | Update settings |
| POST | `/api/admin/upload` | Upload image |

---

## Cloudflare Configuration

The project uses the following Worker configuration:

- Worker name: `cinevault-website`
- Entry point: `src/index.js`
- Compatibility date: `2026-11-23`
- Static assets directory: `./`
- Static assets binding: `ASSETS`
- D1 binding: `DB`
- D1 database name: `cinevault-db`

The database ID is configured in `wrangler.jsonc`.

Do not replace the existing database ID with a new database ID unless intentionally migrating the project.

---

## Environment Variables and Secrets

The following Cloudflare secrets are required:

| Secret | Purpose |
|---|---|
| `ADMIN_PASSWORD` | Administrator login password |
| `CLOUDINARY_API_KEY` | Cloudinary API authentication |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret |

The Cloudinary cloud name is configured in the Worker source.

Never publish API secrets, administrator passwords or private credentials in this repository.

### Configure Secrets

Using Wrangler:

```bash
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put CLOUDINARY_API_KEY
npx wrangler secret put CLOUDINARY_API_SECRET
```

Enter each secret when prompted.

---

## Database Setup

The D1 database must be available and correctly bound to the Worker.

To apply the initial schema to the configured remote database:

```bash
npx wrangler d1 execute cinevault-db --remote --file=schema.sql
```

The Worker also contains automatic table and column initialization logic.

Before applying database changes to an existing production database:

1. Take a database backup.
2. Review the SQL changes.
3. Confirm the target database.
4. Apply migrations carefully.
5. Verify existing movie and collection records.

Do not delete or recreate the production database as a routine update method.

---

## Deployment

### GitHub Deployment

If GitHub is connected to Cloudflare Workers Builds:

1. Open the connected Cloudflare Worker.
2. Verify the GitHub repository connection.
3. Confirm the deployment branch.
4. Commit and push the updated files.
5. Wait for the deployment to complete.
6. Review the deployment logs.

### Wrangler Deployment

If deploying manually:

```bash
npm install -D wrangler
npx wrangler deploy
```

Make sure the correct Cloudflare account is authenticated and the Worker configuration is valid before deployment.

---

## Image Uploads

CineVault uses Cloudinary for image storage.

Supported upload formats:

- JPEG
- PNG
- WebP
- AVIF

Maximum upload size: 5 MB.

Supported upload categories:

- Poster
- Backdrop
- Hero
- Collection
- Logo

Uploaded image URLs are returned by Cloudinary and can be stored in the D1 database or website settings.

---

## Security

Current security measures include:

- HMAC-signed administrator sessions.
- Eight-hour administrator session lifetime.
- HttpOnly session cookie.
- Secure cookie attribute.
- SameSite Strict cookie policy.
- Same-origin checks for state-changing administrator requests.
- HTTP and HTTPS URL validation.
- Image upload type and size validation.
- Parameterized D1 queries.
- Generic public server error responses.
- No public exposure of database credentials or internal stack traces.

Keep all production secrets outside source control.

---

## Current Development Status

The following capabilities are present in the current codebase:

- Cloudflare Worker and D1 integration.
- Dynamic movie catalogue.
- Movie CRUD operations.
- Collection CRUD operations.
- Website settings management.
- Hero banner settings.
- Cloudinary image upload.
- Public movie details API.
- Similar movie retrieval.
- Local watchlist.
- Search, filtering, sorting and pagination.
- Basic informational pages.

The following features are not yet implemented in the current codebase:

- Dynamic navigation manager.
- Custom page builder and page management API.
- Homepage section manager.
- Advanced design manager.
- Complete SEO management dashboard.
- Database backup and restore interface.
- Administrator password change interface.
- Verified repeated-ad download gate.
- Dynamic management of About, Contact, Privacy, Terms and DMCA pages.

These features should be added through coordinated frontend, backend and database updates rather than adding dashboard controls that do not have working API support.

---

## Legal and Content Responsibilities

CineVault is an independent movie discovery project.

The website operator is responsible for ensuring that:

- Movie metadata and images are used lawfully.
- Appropriate permissions are obtained where required.
- External watch and download destinations comply with applicable laws.
- Advertising and analytics providers are disclosed where applicable.
- Privacy and legal pages accurately describe actual website practices.
- Copyright complaints are handled appropriately.

Third-party trademarks, images, logos and other protected materials remain the property of their respective owners.

---

## Maintenance Checklist

Before releasing a production update:

- [ ] Check the homepage.
- [ ] Verify the public movie API.
- [ ] Verify movie details by ID and slug.
- [ ] Test search and filtering.
- [ ] Test 40-movie pagination.
- [ ] Test watchlist storage.
- [ ] Test administrator login and logout.
- [ ] Test movie creation, editing and deletion.
- [ ] Test collection creation, editing and deletion.
- [ ] Test Cloudinary uploads.
- [ ] Verify website settings.
- [ ] Check mobile and desktop layouts.
- [ ] Review Cloudflare Worker logs.
- [ ] Confirm database integrity.
- [ ] Confirm that no secrets are committed.

---

## License

Unless a separate license is added to this repository, the source code is provided without an express open-source license.

Third-party materials remain subject to their respective licenses and ownership rights.

---

**CineVault — Discover Stories. Experience Cinema.**
