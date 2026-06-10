# 🕮 PhotoBookBinder
        
> Frustrated by overwhelmed copy shop employees, the high effort of manual processing, and software that wasn't suited for booklet signature imposition... so I decided to build it myself.. and this is the result :]

I enjoy binding photo books by hand, whether Coptic stitch or Japanese binding. Either way: you have multiple signatures, and the correct page order is everything. Currently designed for **A6 format** ... maybe I'll expand it later.

<img width="1919" height="912" alt="grafik" src="https://github.com/user-attachments/assets/32e31f4a-ffe8-488f-a289-bb48a500afb5" />


## What it does

A browser-based photo book editor that arranges your photos and exports a print-ready PDF with correct booklet imposition. No installation, no backend, just open the HTML file and go.

**My workflow:**

> Take photos → Edit photos → Arrange in PhotoBookBinder → Export PDF → Print double-sided A4 at the copy shop → Walk out happy

_Note: if your print shop supports borderless printing, go for it. Otherwise the default 3mm margin is your friend._


## Features

- Configurable signatures (1–20) and sheets per signature (2–8)
- Drag & drop image import from the file explorer directly onto pages, JPG, PNG, WEBP
- Page layouts: 1, 2, 4, or 6 images per page
- Double-page spread support with automatic image splitting across the fold
- Bleed modes: margins everywhere, outer margin only, or full bleed
- Built-in image editing: pan, zoom, crop with live preview
- Background color per spread
- Auto-fill to distribute photos across all pages
- Thumbnail navigation and signature overview panel


## PDF Export

- A4 portrait, 4× A6 pages per sheet (2x2)
- Correct bookbinding imposition for all signature sizes
- Optional cut lines, crop marks, page numbers, sheet labels
- 300 DPI rendering using full-resolution source images


## Printing & Binding

1. Print **double-sided**, flip on the **long edge**
2. **Cut** each A4 sheet horizontally along the cut line
3. **Fold** each strip vertically → one A6 double-sided sheet
4. **Nest** the folded sheets into signatures
5. **Bind** all signatures together

> Print at exactly **100% / actual size** --> no "fit to page"


## Possible future improvements

- Save / load projects as JSON
- Text elements on pages
- Dedicated cover editor
- More page formats beyond A6

## Notes

- Tested on desktop, not optimized for mobile
- Performance is fine with 100+ photos thanks to ImageBitmap caching and a single-canvas architecture
  
## Photobooks I was thinking of...
<img height="300" alt="Photobook with CopticStitch" src="https://github.com/user-attachments/assets/733a22d8-8b3e-4a36-872d-7afc92860e16" />
<img height="300"  alt="Photobook with CopticStitch" src="https://github.com/user-attachments/assets/d26a309e-686b-47be-a2e6-1b93145c805e" />

