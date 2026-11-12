# Web Theme Images

An internal image library for Rock RMS, built as a **Lava Application** (Helix). Editors upload full-resolution photos, tag them with keywords and audiences, and copy a GUID or a ready-made resize URL to use the image on your website.

Built and tested on Rock v18. Lava Applications and endpoints are required.

## Features

- **Grid and filmstrip views.** The filmstrip has a large viewer with ←/→ keys and on-image arrows.
- **Search, sort, and infinite scroll.** Pages load as you scroll, and thumbnails are lazy-loaded.
- **Resolution dot on each thumbnail.** Red, yellow, or green, by the original's longest edge.
- **Star ratings.** Each thumbnail shows its rating (⊘ for none, or 1–5 stars). Rate from the details panel, from the stars under the filmstrip viewer, or with keys 0–5. A Lightroom-style filter next to search shows images at, above, or below a rating.
- **Upload by button or drag-and-drop.** Files upload one at a time with progress, and the first new image opens in the details panel.
- **Details panel.** Edit the description, keywords (editors can add new ones), and audience, and copy the GUID.
- **Image URL builder.** Opens from a thumbnail, the filmstrip, or the details panel. Set width, height, fit (fit within, crop, pad, stretch), focus point, padding color, format, quality, and upscaling, with a live preview and the actual output size.
- **Delete with recover.** Deleting is soft. The image can be recovered until Rock's cleanup job removes it, about a day later.
- **Follows Rock's light, dark, and system theme.** Colors come from Rock's `--color-interface-*` variables.

## Files

| File | Used by | Purpose |
|---|---|---|
| `content.lava` | Lava Application Content block | Page shell: toolbar, gallery container, details panel, URL builder modal, all JavaScript and CSS |
| `browse.lava` | `browse` endpoint | Grid cards or filmstrip, search, sort, paging |
| `detail.lava` | `detail` endpoint | Details panel: preview, metadata, edit form |
| `update.lava` | `update` endpoint | Saves Description, Keywords, Audience; creates new keywords |
| `delete.lava` | `delete` endpoint | Soft delete (sets `IsTemporary = 1`) |
| `restore.lava` | `restore` endpoint | Recovers a deleted image (sets `IsTemporary = 0`) |
| `rate.lava` | `rate` endpoint | Saves an image's rating (0–5) |

## Installation

### 1. Copy the files

Put the `.lava` files on your Rock web server, for example in:

```
RockWeb/Content/Lava/web-theme-images/
```

The examples below use this path. If you use a different folder, change the `include` paths to match.

### 2. Create the keyword Defined Type

**Admin Tools → Settings → Defined Types → Add**

- Name: `Image Keywords` (any name works)
- Note its **Id**. You'll need it for the configuration in step 5.

For audiences, you can use Rock's built-in **Audience Type** Defined Type or create your own. Note its **Id** too.

### 3. Create the File Type

**Admin Tools → Settings → File Types → Add**

| Setting | Value |
|---|---|
| Name | `Web Theme Images` (any name works) |
| Storage Type | Any File Storage Provider (Database, File System, Azure Blob Storage, ...) |
| Max Width / Max Height | Blank, so originals are kept at full resolution |
| Cache To Server File System | **On.** Resized images are saved on the server. Without this, every thumbnail is rebuilt from the original on every request. |
| Cache Control Header | Public, with a max age of a few days or more. Content never changes under the same GUID. |

Add three **File Attributes** to the type:

| Name | Key | Field Type | Settings |
|---|---|---|---|
| Keywords | `Keywords` | Defined Value | Defined Type = your keyword type, **Allow Multiple** on, **Allow Adding New Values** on |
| Audience | `Audience` | Defined Value | Defined Type = your audience type, **Allow Multiple** on |
| Rating | `Rating` | Rating | Max rating 5 |

The attribute keys must be exactly `Keywords`, `Audience`, and `Rating`.

Note the File Type's **Id** and **Guid**.

### 4. Create the Lava Application

Open **Lava Applications** in Rock's admin menu and add a new application.

- **Slug:** `web-theme-images`. The templates use this slug in several places (`^/web-theme-images/...` and `appSlug` at the top of `content.lava`). If you choose a different slug, find and replace it in every `.lava` file.

### 5. Configuration Rigging

In the application's **Configuration Rigging**, enter the values from your own install:

```json
{
  "FileTypeGuid": "<your File Type Guid>",
  "FileTypeId": 0,
  "PageSize": 48,
  "ThumbWidth": 480,
  "StripWidth": 160,
  "PreviewWidth": 1600,
  "KeywordsDefinedTypeId": 0,
  "AudienceDefinedTypeId": 0
}
```

Configuration Rigging is available to endpoints but **not** to the content block. So also replace the fallback GUID on line 3 of `content.lava` with your File Type Guid:

```liquid
{%- assign fileTypeGuid = ConfigurationRigging.FileTypeGuid | Default:'<your File Type Guid>' -%}
```

### 6. Create the endpoints

Add one endpoint per row. Turn **Cross-Site Forgery Protection** on for all of them. Each endpoint's template is a single `include` line:

```liquid
{% include '~/Content/Lava/web-theme-images/browse.lava' %}
```

| Slug | HTTP Method | Security Mode | Enabled Lava Commands | Template file |
|---|---|---|---|---|
| `browse` | GET | Application View | Sql | `browse.lava` |
| `detail` | GET | Application View | Sql, RockEntity | `detail.lava` |
| `update` | POST | Application Edit | Sql, Modify Entity | `update.lava` |
| `delete` | POST | Application Edit | Sql, Modify Entity | `delete.lava` |
| `restore` | POST | Application Edit | Sql, Modify Entity | `restore.lava` |
| `rate` | POST | Application Edit | Sql, Modify Entity | `rate.lava` |

Watch the HTTP Method on `delete`: it must be **POST**. If it's set to DELETE, every delete returns a 404.

### 7. Add the page

1. Create an internal page, for example under CMS Configuration.
2. Add a **Lava Application Content** block and select the application.
3. Set its content to:

```liquid
{% include '~/Content/Lava/web-theme-images/content.lava' %}
```

### 8. Security

Grant these to the role(s) that manage images:

| Where | Permission | Why |
|---|---|---|
| Lava Application | Execute View, Execute Edit | Browse and view need View; update, rate, delete, and recover need Edit |
| File Type | Edit | Rock's uploader checks this before accepting files |
| Keyword Defined Type | Edit | Lets editors add new keywords |
| The page | View | Opens the gallery |

### 9. Large uploads

Upload size is limited by IIS, not Rock. To accept large originals, raise `maxAllowedContentLength` (in bytes) and `httpRuntime maxRequestLength` (in KB) in `web.config`.

## Using images on your site

Each image is addressed by its GUID:

- Resized: `/GetImage.ashx?guid={guid}&w=1200`. Rock resizes on the server and caches the result. Use the **Build URL** tool for other options.
- Original: `/GetFile.ashx?guid={guid}`

Useful `GetImage.ashx` options: `w`, `h`, `mode` (`max`, `crop`, `pad`, `stretch`), `anchor` (for example `topcenter`), `scale=both` (allow enlarging), `format` (`jpg`, `png`, `gif`), `quality`, `bgcolor` (hex without `#`).

If you set both `w` and `h` without `mode`, Rock keeps only the larger of the two. Always include `mode` when you give both. The URL builder does this for you.

## How delete and recover work

Delete marks the image as temporary (`IsTemporary = 1`). It leaves the gallery immediately, but the record, its keywords, and the stored file are untouched.

Rock's **Rock Cleanup** job permanently removes temporary files (record and stored file) whose last change is more than one day old. Until then, the toolbar's **Recover** toggle lists deleted images and **Recover** puts them back with the same GUID. The one-day window is fixed in Rock.

## Troubleshooting

| Symptom | Cause |
|---|---|
| A change to a `.lava` file doesn't show | Rock caches compiled Lava. Clear the Lava template cache (Admin Tools → Power Tools → Cache Manager). |
| An action shows "Request failed (404)" | The endpoint is missing, inactive, misnamed, or has the wrong HTTP method. |
| Opening an endpoint URL in the browser returns 401 | Expected. Cross-Site Forgery Protection requires a header that only the gallery page sends. Test through the page. |
| Thumbnails are slow every time | **Cache To Server File System** is off on the File Type. |
| Upload fails on large files | The IIS request limits in `web.config`. |
| A Save or Delete fails with a permissions error | The user needs Execute Edit on the application and Edit on the File Type. |

## Notes for developers

- **Template order:** Lava processing first, then markup, then `{% stylesheet %}` last. `{% stylesheet %}` and `{% javascript %}` don't work in endpoints, so all CSS and JavaScript live in `content.lava`.
- **CSS:** class names use the `wti-` prefix. Colors use Rock's CSS variables, so light and dark mode work.
- **SQL:** every user-supplied value is passed as a named `{% sql %}` parameter. Submitted GUIDs are validated against their own Defined Type or the File Type before anything is written.
- **Forms:** the Rock page is one WebForms `<form>`, so the templates use `<lava-form>` with `type="button"` buttons rather than nested forms.
- **Modify Entity:** ignores `result:` in this version. Read `ModifyResult` right after each modify command.
- **Hidden elements:** some themes override the `hidden` attribute, so the templates hide elements with a class that uses `display: none !important`.
- **Azure Blob Storage:** the blob name is built from the file's GUID and `FileName` on every read and delete. Never change a file's `FileName`. Put readable titles in `Description`.
