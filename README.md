# Coil Stock Scanner

Open `index.html` from a web server (or the repository's hosted page), take/select a photo, and scan. The app finds the blue Unionsteel label, corrects its perspective and orientation, reads the printed fields, and shows the straightened label with editable results. Photos and results stay in the browser. The OCR library needs an internet connection on first load.

On a phone, tap **START LIVE SCANNER** and allow the site's camera request. A yellow outline becomes green when the full label is visible; hold it steady for automatic capture and OCR. **STOP CAMERA** or the photo picker are available as fallbacks. On iPhone, open the page in Safari and use Share → Add to Home Screen; `coil-icon.png` is the home-screen icon.

If the live outline misses the label, tap **DOWNLOAD TEST REPORT** while the camera is still showing it, then attach the ZIP to the chat. The report contains a camera frame, the drawn boundary, the blue-pixel mask, camera dimensions, and recent detection decisions. **CAPTURE NOW** scans without waiting for the outline. After a scan, the result's report button additionally includes the original photo, straightened and enhanced images, raw OCR text, detected values, and validation details. Nothing is sent to a server by this button; it only saves a ZIP on the phone.

The scanner extracts the printed colour name **or** printed colour code, depending on the label. It does not look up a colour name from a code. Missing readings and conflicting lb/kg or ft/m values appear in yellow. Always check the values against the straightened photo before using them. The sample photos in `test-photos` include glare, tears, perspective angles, and partial text that OCR cannot reliably recover.

`scanner-core.js` handles label detection and perspective correction; `scanner.js` handles browser OCR, display, and unit checks. The test photos remain unchanged.
