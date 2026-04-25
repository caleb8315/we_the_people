/**
 * Client-side image forensics — 100% free, no server, no API keys.
 *
 * Runs entirely in the browser using:
 *   - exifr for EXIF/XMP/IPTC metadata extraction
 *   - HTML5 Canvas for Error Level Analysis (ELA)
 *   - Heuristic checks for AI-generation markers
 *
 * What it can detect:
 *   - AI-generated images (via metadata markers from DALL-E, Midjourney,
 *     Stable Diffusion, Adobe Firefly, etc.)
 *   - Photo manipulation (via ELA highlighting edited regions)
 *   - Missing camera data (real photos have EXIF; AI/screenshots don't)
 *   - Editing software traces (Photoshop, GIMP, etc.)
 *   - Content Credentials / C2PA provenance markers
 *   - Suspicious dimension patterns typical of AI generators
 */

export interface ForensicFinding {
  label: string;
  detail: string;
  severity: 'info' | 'note' | 'warning' | 'alert';
}

export interface MetadataReport {
  camera_make: string | null;
  camera_model: string | null;
  software: string | null;
  date_taken: string | null;
  gps: { lat: number; lon: number } | null;
  dimensions: { width: number; height: number } | null;
  has_exif: boolean;
  raw_tags: Record<string, unknown>;
}

export interface ElaResult {
  data_url: string;
  max_diff: number;
}

export interface ForensicReport {
  verdict: 'likely_authentic' | 'possibly_edited' | 'likely_ai_generated' | 'suspicious' | 'inconclusive';
  verdict_label: string;
  verdict_explanation: string;
  confidence_note: string;
  findings: ForensicFinding[];
  metadata: MetadataReport;
  ela: ElaResult | null;
}

const AI_SOFTWARE_MARKERS = [
  'dall-e', 'dall·e', 'openai', 'chatgpt',
  'midjourney', 'mj',
  'stable diffusion', 'stablediffusion', 'automatic1111', 'a1111', 'comfyui', 'invoke',
  'firefly', 'adobe firefly',
  'imagen', 'gemini',
  'bing image creator', 'designer',
  'leonardo', 'leonardo.ai',
  'nightcafe', 'dream studio', 'dreamstudio',
  'flux', 'ideogram', 'playground',
  'c2pa', 'content credentials',
];

const EDITING_SOFTWARE_MARKERS = [
  'photoshop', 'gimp', 'lightroom', 'capture one',
  'affinity', 'pixlr', 'canva', 'snapseed',
  'paint.net', 'paintshop', 'acdsee', 'darktable',
  'rawtherapee', 'luminar', 'on1', 'dxo',
  'faceapp', 'facetune', 'remini', 'beautycam',
];

const AI_DIMENSION_PATTERNS = [
  [512, 512], [768, 768], [1024, 1024], [1536, 1536], [2048, 2048],
  [512, 768], [768, 512], [768, 1024], [1024, 768],
  [1024, 1792], [1792, 1024],
  [896, 1152], [1152, 896],
  [640, 1536], [1536, 640],
];

export async function analyzeImage(file: File): Promise<ForensicReport> {
  const findings: ForensicFinding[] = [];

  const [metadata, ela, dimensions] = await Promise.all([
    extractMetadata(file),
    runEla(file).catch(() => null),
    getImageDimensions(file),
  ]);

  if (dimensions) {
    metadata.dimensions = dimensions;
  }

  checkAiMarkers(metadata, findings);
  checkCameraAuthenticity(metadata, findings);
  checkEditingSoftware(metadata, findings);
  checkDimensions(metadata, findings);
  checkElaResults(ela, findings);
  checkDateConsistency(metadata, findings);
  checkGps(metadata, findings);

  const verdict = determineVerdict(findings, metadata);

  return {
    ...verdict,
    findings,
    metadata,
    ela,
  };
}

async function extractMetadata(file: File): Promise<MetadataReport> {
  const report: MetadataReport = {
    camera_make: null,
    camera_model: null,
    software: null,
    date_taken: null,
    gps: null,
    dimensions: null,
    has_exif: false,
    raw_tags: {},
  };

  try {
    const exifr = await import('exifr');
    const data = await exifr.default.parse(file, true);
    if (!data) return report;

    report.has_exif = true;
    report.raw_tags = data;
    report.camera_make = data.Make ?? null;
    report.camera_model = data.Model ?? null;
    report.software = data.Software ?? data.Creator ?? data.CreatorTool ?? null;

    if (data.DateTimeOriginal) {
      report.date_taken = data.DateTimeOriginal instanceof Date
        ? data.DateTimeOriginal.toISOString()
        : String(data.DateTimeOriginal);
    }

    if (data.latitude != null && data.longitude != null) {
      report.gps = { lat: data.latitude, lon: data.longitude };
    }
  } catch {
    // File has no parseable metadata
  }

  return report;
}

function checkAiMarkers(meta: MetadataReport, findings: ForensicFinding[]) {
  const searchText = [
    meta.software ?? '',
    meta.camera_make ?? '',
    meta.camera_model ?? '',
    JSON.stringify(meta.raw_tags),
  ].join(' ').toLowerCase();

  for (const marker of AI_SOFTWARE_MARKERS) {
    if (searchText.includes(marker)) {
      findings.push({
        label: 'AI generation marker detected',
        detail: `Found "${marker}" in the image metadata. This is a strong indicator the image was created by an AI tool, not a camera.`,
        severity: 'alert',
      });
      return;
    }
  }

  if (searchText.includes('c2pa') || searchText.includes('content credentials')) {
    findings.push({
      label: 'Content Credentials found',
      detail: 'This image contains C2PA content credentials, which may include provenance data about how it was created or modified.',
      severity: 'note',
    });
  }
}

function checkCameraAuthenticity(meta: MetadataReport, findings: ForensicFinding[]) {
  if (meta.camera_make && meta.camera_model) {
    findings.push({
      label: 'Camera data present',
      detail: `Taken with ${meta.camera_make} ${meta.camera_model}. Real photos typically carry camera metadata; AI-generated images rarely do.`,
      severity: 'info',
    });

    const hasLens = meta.raw_tags && (
      'LensModel' in meta.raw_tags ||
      'FocalLength' in meta.raw_tags ||
      'FNumber' in meta.raw_tags
    );
    if (hasLens) {
      const parts: string[] = [];
      if (meta.raw_tags.LensModel) parts.push(`Lens: ${meta.raw_tags.LensModel}`);
      if (meta.raw_tags.FocalLength) parts.push(`Focal length: ${meta.raw_tags.FocalLength}mm`);
      if (meta.raw_tags.FNumber) parts.push(`Aperture: f/${meta.raw_tags.FNumber}`);
      findings.push({
        label: 'Lens and exposure data present',
        detail: `${parts.join(', ')}. Detailed optical data like this is very hard to fake and strongly suggests a real photograph.`,
        severity: 'info',
      });
    }
  } else if (meta.has_exif && !meta.camera_make) {
    findings.push({
      label: 'No camera identified',
      detail: 'The image has some metadata but no camera make/model. This can happen with screenshots, AI-generated images, or heavily re-saved files.',
      severity: 'warning',
    });
  } else if (!meta.has_exif) {
    findings.push({
      label: 'No metadata found',
      detail: 'This image has been stripped of all metadata. Real photos from cameras and phones almost always carry EXIF data. Stripping metadata is common when sharing on social media, but also when trying to hide an image\'s origin.',
      severity: 'warning',
    });
  }
}

function checkEditingSoftware(meta: MetadataReport, findings: ForensicFinding[]) {
  if (!meta.software) return;
  const sw = meta.software.toLowerCase();

  for (const marker of EDITING_SOFTWARE_MARKERS) {
    if (sw.includes(marker)) {
      const isFaceApp = ['faceapp', 'facetune', 'remini', 'beautycam'].some(m => sw.includes(m));
      if (isFaceApp) {
        findings.push({
          label: 'Face-editing app detected',
          detail: `Processed with "${meta.software}". This app specifically modifies faces and appearances, so facial features in this image may not be authentic.`,
          severity: 'alert',
        });
      } else {
        findings.push({
          label: 'Photo editing software detected',
          detail: `Last saved with "${meta.software}". This doesn't mean the image is fake — professional photographers edit every photo — but the image has been modified from its original capture.`,
          severity: 'note',
        });
      }
      return;
    }
  }
}

function checkDimensions(meta: MetadataReport, findings: ForensicFinding[]) {
  if (!meta.dimensions) return;
  const { width, height } = meta.dimensions;

  for (const [w, h] of AI_DIMENSION_PATTERNS) {
    if (width === w && height === h) {
      findings.push({
        label: 'AI-typical dimensions',
        detail: `Image is ${width}×${height}px, which is a standard output size for AI image generators. Camera photos almost never have these exact dimensions.`,
        severity: 'warning',
      });
      return;
    }
  }

  if (width === height && width >= 512 && width <= 2048 && (width & (width - 1)) === 0) {
    findings.push({
      label: 'Perfect square, power-of-2 dimensions',
      detail: `Image is ${width}×${height}px. Perfectly square power-of-2 images are common from AI generators but rare from cameras.`,
      severity: 'note',
    });
  }
}

function checkElaResults(ela: ElaResult | null, findings: ForensicFinding[]) {
  if (!ela) return;

  if (ela.max_diff > 200) {
    findings.push({
      label: 'High error levels detected',
      detail: 'Error Level Analysis found significant differences across the image. This can indicate regions that were added, pasted, or modified after the original was saved. Check the ELA overlay to see which areas stand out.',
      severity: 'warning',
    });
  } else if (ela.max_diff > 120) {
    findings.push({
      label: 'Moderate error level variation',
      detail: 'Some variation in error levels was detected. This is normal for images that have been re-saved or lightly edited, but large bright patches in the ELA overlay may indicate spliced regions.',
      severity: 'note',
    });
  } else {
    findings.push({
      label: 'Uniform error levels',
      detail: 'Error levels across the image are relatively uniform, which is consistent with an unmodified image. However, ELA is not foolproof — sophisticated edits can sometimes evade it.',
      severity: 'info',
    });
  }
}

function checkDateConsistency(meta: MetadataReport, findings: ForensicFinding[]) {
  if (!meta.date_taken) return;

  try {
    const taken = new Date(meta.date_taken);
    const now = new Date();
    if (taken > now) {
      findings.push({
        label: 'Future date in metadata',
        detail: `The image claims to have been taken on ${taken.toLocaleDateString()}, which is in the future. This metadata is either wrong or fabricated.`,
        severity: 'alert',
      });
    } else {
      findings.push({
        label: 'Date stamp present',
        detail: `Metadata says this was captured on ${taken.toLocaleDateString()} at ${taken.toLocaleTimeString()}. Date stamps can be faked but are present in most unmodified photos.`,
        severity: 'info',
      });
    }
  } catch {
    // Unparseable date
  }
}

function checkGps(meta: MetadataReport, findings: ForensicFinding[]) {
  if (!meta.gps) return;
  findings.push({
    label: 'GPS location embedded',
    detail: `The image contains GPS coordinates (${meta.gps.lat.toFixed(4)}, ${meta.gps.lon.toFixed(4)}). Location data is stripped by most social platforms and AI tools, so its presence suggests an original camera photo.`,
    severity: 'info',
  });
}

function determineVerdict(
  findings: ForensicFinding[],
  meta: MetadataReport,
): Pick<ForensicReport, 'verdict' | 'verdict_label' | 'verdict_explanation' | 'confidence_note'> {
  const hasAiMarker = findings.some(f => f.label === 'AI generation marker detected');
  const hasAiDimensions = findings.some(f => f.label === 'AI-typical dimensions');
  const hasFaceApp = findings.some(f => f.label === 'Face-editing app detected');
  const hasCamera = findings.some(f => f.label === 'Camera data present');
  const hasLens = findings.some(f => f.label === 'Lens and exposure data present');
  const noMetadata = findings.some(f => f.label === 'No metadata found');
  const noCamera = findings.some(f => f.label === 'No camera identified');
  const highEla = findings.some(f => f.label === 'High error levels detected');
  const hasEditor = findings.some(f => f.label === 'Photo editing software detected');

  if (hasAiMarker) {
    return {
      verdict: 'likely_ai_generated',
      verdict_label: 'Likely AI-generated',
      verdict_explanation: 'This image contains metadata markers from a known AI image generator. The tool that created it left a digital signature in the file.',
      confidence_note: 'AI metadata markers are strong evidence, but it\'s theoretically possible (though unusual) for someone to add fake AI markers to a real photo.',
    };
  }

  if (hasFaceApp) {
    return {
      verdict: 'suspicious',
      verdict_label: 'Faces may be altered',
      verdict_explanation: 'This image was processed with a face-editing app that specifically modifies facial features and appearances. The people in this image may not look like this in real life.',
      confidence_note: 'Face-editing apps range from minor touch-ups to complete face swaps. We can detect the app was used, but not the extent of the changes.',
    };
  }

  if (hasAiDimensions && noMetadata) {
    return {
      verdict: 'likely_ai_generated',
      verdict_label: 'Likely AI-generated',
      verdict_explanation: 'This image has dimensions that are standard AI generator output sizes and contains no camera metadata at all. Real photos from cameras and phones almost always carry EXIF data.',
      confidence_note: 'No single check is definitive. An image could be cropped to these dimensions and have metadata stripped for privacy reasons.',
    };
  }

  if (hasAiDimensions && noCamera) {
    return {
      verdict: 'suspicious',
      verdict_label: 'Suspicious — may be AI-generated',
      verdict_explanation: 'The image dimensions match known AI generator outputs and there\'s no camera information. This combination is common in AI-generated images.',
      confidence_note: 'Some real images can share these characteristics, especially screenshots or heavily processed photos.',
    };
  }

  if (hasCamera && hasLens && !highEla) {
    return {
      verdict: 'likely_authentic',
      verdict_label: 'Likely an authentic photo',
      verdict_explanation: 'This image carries detailed camera and lens metadata that is consistent with a real photograph. The error level analysis doesn\'t show obvious manipulation.',
      confidence_note: 'Metadata can theoretically be fabricated, but doing so convincingly (with consistent lens/exposure data) requires significant effort. This is almost certainly a real photo.',
    };
  }

  if (hasCamera && highEla) {
    return {
      verdict: 'possibly_edited',
      verdict_label: 'Real photo, possibly edited',
      verdict_explanation: 'This appears to be a real photograph (camera data is present), but the error level analysis suggests some regions may have been modified after capture.',
      confidence_note: 'ELA highlights are not always manipulation — text overlays, saved-from-screenshot artifacts, and heavy compression can cause similar patterns.',
    };
  }

  if (hasCamera && hasEditor) {
    return {
      verdict: 'possibly_edited',
      verdict_label: 'Real photo, edited',
      verdict_explanation: `This is a real photograph that was processed with editing software (${meta.software}). Most professional photos go through editing — this doesn't mean it's fake, but the image has been modified from its original capture.`,
      confidence_note: 'Photo editing is standard practice. The key question is whether edits changed the meaning of the image, not whether edits happened at all.',
    };
  }

  if (noMetadata && highEla) {
    return {
      verdict: 'suspicious',
      verdict_label: 'Suspicious — can\'t verify origin',
      verdict_explanation: 'The image has no metadata and shows uneven error levels. Without any provenance data, we can\'t determine where this came from or whether it\'s been manipulated.',
      confidence_note: 'Social media platforms strip metadata from uploads. A stripped image isn\'t automatically fake, but it does mean we have less to work with.',
    };
  }

  return {
    verdict: 'inconclusive',
    verdict_label: 'Inconclusive',
    verdict_explanation: 'We couldn\'t find strong enough signals to make a determination either way. The image may be authentic, AI-generated, or edited — our automated checks aren\'t definitive here.',
    confidence_note: 'Our analysis checks metadata, dimensions, and error levels. It can\'t detect every type of manipulation, especially sophisticated edits or newer AI generators that don\'t leave markers.',
  };
}

async function runEla(file: File): Promise<ElaResult> {
  const img = await loadImage(file);
  const { width, height } = img;

  const maxDim = 1200;
  const scale = Math.min(1, maxDim / Math.max(width, height));
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);

  const original = document.createElement('canvas');
  original.width = w;
  original.height = h;
  const origCtx = original.getContext('2d')!;
  origCtx.drawImage(img, 0, 0, w, h);
  const origData = origCtx.getImageData(0, 0, w, h);

  const recompressed = document.createElement('canvas');
  recompressed.width = w;
  recompressed.height = h;
  const recompUrl = original.toDataURL('image/jpeg', 0.75);
  const recompImg = await loadImageFromUrl(recompUrl);
  const recompCtx = recompressed.getContext('2d')!;
  recompCtx.drawImage(recompImg, 0, 0, w, h);
  const recompData = recompCtx.getImageData(0, 0, w, h);

  const diff = origCtx.createImageData(w, h);
  let maxDiff = 0;

  for (let i = 0; i < origData.data.length; i += 4) {
    const dr = Math.abs(origData.data[i]! - recompData.data[i]!) * 10;
    const dg = Math.abs(origData.data[i + 1]! - recompData.data[i + 1]!) * 10;
    const db = Math.abs(origData.data[i + 2]! - recompData.data[i + 2]!) * 10;
    diff.data[i] = Math.min(255, dr);
    diff.data[i + 1] = Math.min(255, dg);
    diff.data[i + 2] = Math.min(255, db);
    diff.data[i + 3] = 255;
    maxDiff = Math.max(maxDiff, dr, dg, db);
  }

  origCtx.putImageData(diff, 0, 0);
  return {
    data_url: original.toDataURL('image/png'),
    max_diff: maxDiff,
  };
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image')); };
    img.src = url;
  });
}

function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = url;
  });
}

function getImageDimensions(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve({ width: img.naturalWidth, height: img.naturalHeight }); };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}
