# Receipt scan feature – step-by-step guide

This guide walks you through the receipt scanning feature that uses **Tesseract** to read amounts from receipt images and deduct them from the event’s shared wallet.

---

## What’s already done in the codebase

- **Backend:** Upload middleware, OCR service (`receiptOcr.js`), receipt controller and routes, `app.js` wiring, `uploads/receipts` created at runtime.
- **Frontend:** “Scan receipt” block on the event detail page, `api.postForm`, and styles.
- **Dependencies:** `multer` and `node-tesseract-ocr` are in `package.json` (install with `npm install` if needed).

---

## Step 1: Install Tesseract on your system (if not already)

You said Tesseract is already installed. If you need to reinstall or use another machine:

- **Windows:** Download from [GitHub - tesseract](https://github.com/UB-Mannheim/tesseract/wiki) and run the installer. Note the install path (e.g. `C:\Program Files\Tesseract-OCR`).
- **Mac:** `brew install tesseract`
- **Linux:** `sudo apt install tesseract-ocr` (or equivalent).

Ensure `tesseract` is on your system PATH, or you’ll set `TESSERACT_PATH` in Step 3.

---

## Step 2: Install Node dependencies

From the **project root** (where `package.json` is):

```bash
npm install
```

This installs `multer` and `node-tesseract-ocr` along with the rest of the dependencies.

---

## Step 3: Configure Tesseract path (optional)

If `tesseract` is **not** on your system PATH (e.g. on Windows you installed to `C:\Program Files\Tesseract-OCR`):

1. Open `.env` in the project root (copy from `.env.example` if you don’t have one).
2. Add or uncomment:

```env
TESSERACT_PATH=C:\Program Files\Tesseract-OCR\tesseract.exe
```

Use the path where `tesseract.exe` actually is on your machine.  
If Tesseract is already on PATH, you can leave this unset.

---

## Step 4: Create the uploads folder (optional)

The app creates `uploads/receipts` the first time someone uploads a receipt. To create it yourself:

- **Windows (PowerShell):**  
  `New-Item -ItemType Directory -Force -Path "uploads\receipts"`
- **Mac/Linux:**  
  `mkdir -p uploads/receipts`

`uploads/` is in `.gitignore`, so receipt images are not committed.

---

## Step 5: Start the backend

From the project root:

```bash
node app.js
```

Or, if you use nodemon:

```bash
npx nodemon app.js
```

You should see: `Server is listening on port 3000` (or your `PORT`).  
Uploaded receipt images will be served at `http://localhost:3000/uploads/receipts/<filename>`.

---

## Step 6: Start the frontend

In a **second terminal**, from the project root:

```bash
cd client
npm install
npm run dev
```

Leave this running. The app usually runs at `http://localhost:5173`.

---

## Step 7: Use the feature in the app

1. Log in and open an **event** that is **active** and has a **wallet balance > 0**.
2. On the event detail page, find the **“Scan receipt (deduct from wallet)”** section below the “Spend from wallet” form.
3. Click **“Choose receipt image or scan”** and select a receipt image (JPEG, PNG, or WebP).  
   - The backend runs Tesseract on the image and returns an **amount** and optional **description**.
4. Review the pre-filled **amount** and **description**; change them if needed.
5. If the event has **categories**, pick one from the dropdown (a suggestion may be pre-selected from the receipt text).
6. Click **“Confirm and deduct from wallet”**.  
   - The amount is deducted from the event’s shared wallet, an expense is created (with the receipt image attached if you uploaded one), and the transaction appears in recent activity.
7. To scan another receipt, use “Choose receipt image or scan” again. To cancel, click **“Cancel”**.

---

## Troubleshooting

### “OCR failed” / “Could not extract a valid amount”

- Ensure **Tesseract** is installed and, if needed, **TESSERACT_PATH** is set in `.env`.
- Use a **clear, well-lit** image (receipt in focus, not blurry). Cropping to just the receipt helps.
- If the amount still isn’t detected, you can **manually enter the amount** after the first scan (the form lets you edit before confirming).

### “Valid amount is required” when confirming

- The **process** endpoint needs either a **file** (to run OCR) or **amount** in the form.  
  Make sure the confirm form has a number in the amount field and, if you didn’t upload a file, that you didn’t clear the amount.

### Receipt images not loading (404)

- Backend must be running and **`app.use("/uploads", express.static(...))`** must be in `app.js` (it’s already added).  
  Images are at `http://localhost:3000/uploads/receipts/<filename>`.

### CORS or network errors from the client

- Backend should run on the port in `API_BASE` in `client/src/lib/api.js` (default `http://localhost:3000/api/v1`).  
  Keep backend and frontend ports consistent with your setup.

---

## File reference (what was added or changed)

| Location | Purpose |
|--------|----------|
| `middleware/upload.js` | Multer config: store receipt images in `uploads/receipts`, limit 10 MB, allow JPEG/PNG/WebP. |
| `services/receiptOcr.js` | Tesseract OCR, amount/description parsing, optional category suggestion from text. |
| `controllers/receipt.js` | `scanReceipt`: OCR only. `processReceipt`: create expense + deduct from wallet. |
| `routes/receipt.js` | `POST /events/:id/receipts/scan`, `POST /events/:id/receipts/process` (auth + multer). |
| `app.js` | Mount receipt router and static `uploads` folder. |
| `package.json` | Dependencies: `multer`, `node-tesseract-ocr`. |
| `.gitignore` | `uploads/` so receipt files aren’t committed. |
| `.env.example` | Optional `TESSERACT_PATH` for system Tesseract. |
| `client/src/lib/api.js` | `api.postForm(url, formData)` for multipart uploads. |
| `client/src/pages/EventDetail.jsx` | Receipt upload, scan result form, confirm/cancel and deduct flow. |
| `client/src/styles/Events.css` | Styles for receipt upload zone and confirm form. |

---

## API summary

- **POST** `/api/v1/events/:id/receipts/scan`  
  - Body: multipart with field `receipt` (image file).  
  - Response: `{ amount, description, suggestedCategoryId?, suggestedCategoryName? }`.

- **POST** `/api/v1/events/:id/receipts/process`  
  - Body: multipart with optional `receipt` (image), and fields `amount`, `description`, `categoryId`.  
  - Creates an expense and deducts `amount` from the event wallet.  
  - Response: `{ expense, transaction, wallet, message }`.

Both routes require authentication (Bearer token).
