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
  is_screenshot: boolean;
  raw_tags: Record<string, unknown>;
}

export interface PixelAnalysis {
  noise_score: number;
  flat_region_ratio: number;
  saturation_uniformity: number;
  ai_likelihood: number;
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
  pixel_analysis: PixelAnalysis | null;
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

  const [metadata, ela, dimensions, pixelAnalysis] = await Promise.all([
    extractMetadata(file),
    runEla(file).catch(() => null),
    getImageDimensions(file),
    runPixelAnalysis(file).catch(() => null),
  ]);

  if (dimensions) {
    metadata.dimensions = dimensions;
  }

  detectScreenshot(metadata, findings);
  checkAiMarkers(metadata, findings);
  checkCameraAuthenticity(metadata, findings);
  checkEditingSoftware(metadata, findings);
  checkDimensions(metadata, findings);
  checkPixelAnalysis(pixelAnalysis, metadata, findings);
  checkElaResults(ela, findings);
  checkDateConsistency(metadata, findings);
  checkGps(metadata, findings);

  const verdict = determineVerdict(findings, metadata, pixelAnalysis);

  return {
    ...verdict,
    findings,
    metadata,
    ela,
    pixel_analysis: pixelAnalysis,
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
    is_screenshot: false,
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

const SCREEN_RESOLUTIONS = new Set([
  '750x1334', '1125x2436', '1170x2532', '1179x2556', '1242x2688',
  '1284x2778', '1290x2796', '1320x2868',
  '2048x2732', '2388x1668', '2360x1640',
  '1080x1920', '1080x2340', '1080x2400', '1440x3200', '1440x3120',
  '1440x2560', '1080x2280', '1080x2160',
  '2560x1440', '1920x1080', '2880x1800', '3024x1964', '3456x2234',
  '2560x1600', '3840x2160',
]);

function detectScreenshot(meta: MetadataReport, findings: ForensicFinding[]) {
  if (!meta.dimensions) return;
  const { width, height } = meta.dimensions;
  const dimKey = `${width}x${height}`;
  const dimKeyFlipped = `${height}x${width}`;

  const hasScreenDims = SCREEN_RESOLUTIONS.has(dimKey) || SCREEN_RESOLUTIONS.has(dimKeyFlipped);
  const hasLens = meta.raw_tags && ('LensModel' in meta.raw_tags || 'FocalLength' in meta.raw_tags);
  const isPhone = meta.camera_make && /apple|samsung|google|pixel|oneplus|xiaomi|huawei|oppo|vivo/i.test(meta.camera_make);

  if (hasScreenDims && !hasLens) {
    meta.is_screenshot = true;
    findings.push({
      label: 'This is a screenshot',
      detail: `The image dimensions (${width}×${height}) match a phone or computer screen resolution, and there\u2019s no lens or camera sensor data. This is a screenshot of something else \u2014 whatever was originally in the image has had its metadata replaced. Our pixel analysis below examines the actual image content instead.`,
      severity: 'warning',
    });
  } else if (isPhone && hasScreenDims && !hasLens) {
    meta.is_screenshot = true;
    findings.push({
      label: 'Phone screenshot detected',
      detail: `Captured on a ${meta.camera_make} device, but dimensions match the screen resolution and there\u2019s no lens data. This is a screenshot, not a photo taken with the camera. The original image\u2019s metadata has been lost.`,
      severity: 'warning',
    });
  }

  const fname = (meta.raw_tags?.FileName as string) ?? '';
  if (/screenshot|screen shot|capture/i.test(fname)) {
    if (!meta.is_screenshot) {
      meta.is_screenshot = true;
      findings.push({
        label: 'Screenshot filename detected',
        detail: 'The filename contains "screenshot" or "capture", indicating this is a screen capture rather than an original image.',
        severity: 'warning',
      });
    }
  }
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
  if (meta.is_screenshot) return;

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
  pixelAnalysis: PixelAnalysis | null,
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
  const isScreenshot = meta.is_screenshot;
  const pixelAiHigh = pixelAnalysis != null && pixelAnalysis.ai_likelihood >= 50;
  const pixelAiMedium = pixelAnalysis != null && pixelAnalysis.ai_likelihood >= 30;
  const hasNaturalNoise = findings.some(f => f.label === 'Natural sensor noise detected');

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

  if (isScreenshot && pixelAiHigh) {
    return {
      verdict: 'likely_ai_generated',
      verdict_label: 'Likely AI-generated (screenshotted)',
      verdict_explanation: 'This is a screenshot, so the original image\'s metadata is gone. However, our pixel analysis of the actual image content found patterns strongly associated with AI-generated images: unusually smooth textures, low natural noise, and uniform color patterns that real camera sensors almost never produce.',
      confidence_note: 'Pixel analysis is probabilistic, not definitive. Very clean studio photography or heavily filtered photos can occasionally show similar characteristics. But combined with the screenshot context, AI generation is the most likely explanation.',
    };
  }

  if (isScreenshot && pixelAiMedium) {
    return {
      verdict: 'suspicious',
      verdict_label: 'Suspicious — possible AI content',
      verdict_explanation: 'This is a screenshot, which means the original metadata is lost. Our pixel analysis found some characteristics associated with AI-generated content, though the signals aren\'t strong enough for a definitive call. The image could be AI-generated, heavily filtered, or a clean real photo.',
      confidence_note: 'Screenshots destroy provenance data, making verification harder. When someone screenshots an AI image and shares it, this is often the best we can do without the original file.',
    };
  }

  if (isScreenshot && !pixelAiMedium) {
    return {
      verdict: 'inconclusive',
      verdict_label: 'Screenshot — original source unknown',
      verdict_explanation: 'This is a screenshot, so the original image\'s metadata has been replaced by the device\'s capture data. Our pixel analysis didn\'t find strong AI-generation indicators, but that doesn\'t prove authenticity either. The original image could be anything — a real photo, an AI image, or an edit.',
      confidence_note: 'If you need to verify a screenshot, try to find and submit the original image from the source. Screenshots inherently lose the forensic data we need for confident analysis.',
    };
  }

  if (hasAiDimensions && noMetadata && pixelAiHigh) {
    return {
      verdict: 'likely_ai_generated',
      verdict_label: 'Likely AI-generated',
      verdict_explanation: 'Multiple signals point to AI generation: the dimensions match standard AI output sizes, there\'s no camera metadata, and our pixel analysis found texture patterns typical of AI-generated images.',
      confidence_note: 'No single check is definitive, but three independent indicators together make a strong case.',
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

  if (pixelAiHigh && (noMetadata || noCamera)) {
    return {
      verdict: 'suspicious',
      verdict_label: 'Suspicious — AI-like pixel patterns',
      verdict_explanation: 'Our pixel analysis found characteristics strongly associated with AI-generated content (unusually smooth textures, low sensor noise, uniform saturation), and there\'s no camera data to confirm this is a real photograph.',
      confidence_note: 'Pixel-level analysis is probabilistic. Very clean or heavily processed real photos can occasionally trigger these indicators.',
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

  if (hasCamera && hasLens && hasNaturalNoise) {
    return {
      verdict: 'likely_authentic',
      verdict_label: 'Likely an authentic photo',
      verdict_explanation: 'This image has camera and lens metadata, and our pixel analysis confirms natural sensor noise patterns consistent with a real camera. AI images typically lack this kind of noise.',
      confidence_note: 'The combination of consistent camera metadata and natural noise patterns makes this very likely authentic.',
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

  if (noMetadata && pixelAiMedium) {
    return {
      verdict: 'suspicious',
      verdict_label: 'Suspicious — no metadata, some AI indicators',
      verdict_explanation: 'This image has no metadata and our pixel analysis found some characteristics associated with AI-generated content. Without provenance data, we can\'t confirm the origin.',
      confidence_note: 'Images shared on social media often have metadata stripped. The pixel indicators alone aren\'t enough for a definitive verdict.',
    };
  }

  return {
    verdict: 'inconclusive',
    verdict_label: 'Inconclusive',
    verdict_explanation: 'We couldn\'t find strong enough signals to make a determination either way. The image may be authentic, AI-generated, or edited — our automated checks aren\'t definitive here.',
    confidence_note: 'Our analysis checks metadata, dimensions, pixel patterns, and error levels. It can\'t detect every type of manipulation, especially sophisticated edits or newer AI generators that don\'t leave markers.',
  };
}

async function runPixelAnalysis(file: File): Promise<PixelAnalysis> {
  const img = await loadImage(file);
  const maxDim = 512;
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);
  const pixels = imageData.data;

  let noiseDiffs = 0;
  let totalPairs = 0;
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      const iRight = i + 4;
      const iDown = ((y + 1) * w + x) * 4;
      const dr1 = Math.abs(pixels[i]! - pixels[iRight]!);
      const dg1 = Math.abs(pixels[i + 1]! - pixels[iRight + 1]!);
      const db1 = Math.abs(pixels[i + 2]! - pixels[iRight + 2]!);
      noiseDiffs += dr1 + dg1 + db1;
      const dr2 = Math.abs(pixels[i]! - pixels[iDown]!);
      const dg2 = Math.abs(pixels[i + 1]! - pixels[iDown + 1]!);
      const db2 = Math.abs(pixels[i + 2]! - pixels[iDown + 2]!);
      noiseDiffs += dr2 + dg2 + db2;
      totalPairs += 2;
    }
  }
  const avgNoise = noiseDiffs / (totalPairs * 3);

  let flatPixels = 0;
  const flatThreshold = 3;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      let isFlat = true;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
        const j = ((y + dy) * w + (x + dx)) * 4;
        if (
          Math.abs(pixels[i]! - pixels[j]!) > flatThreshold &&
          Math.abs(pixels[i + 1]! - pixels[j + 1]!) > flatThreshold
        ) {
          isFlat = false;
          break;
        }
      }
      if (isFlat) flatPixels++;
    }
  }
  const innerPixels = (w - 2) * (h - 2);
  const flatRatio = innerPixels > 0 ? flatPixels / innerPixels : 0;

  const satValues: number[] = [];
  const sampleStep = Math.max(1, Math.floor(pixels.length / (4 * 2000)));
  for (let i = 0; i < pixels.length; i += 4 * sampleStep) {
    const r = pixels[i]! / 255;
    const g = pixels[i + 1]! / 255;
    const b = pixels[i + 2]! / 255;
    const cMax = Math.max(r, g, b);
    const cMin = Math.min(r, g, b);
    const sat = cMax === 0 ? 0 : (cMax - cMin) / cMax;
    satValues.push(sat);
  }
  const meanSat = satValues.reduce((a, b) => a + b, 0) / satValues.length;
  const satVariance = satValues.reduce((a, b) => a + (b - meanSat) ** 2, 0) / satValues.length;
  const satStdDev = Math.sqrt(satVariance);

  let aiLikelihood = 0;

  if (avgNoise < 4) aiLikelihood += 30;
  else if (avgNoise < 7) aiLikelihood += 15;
  else if (avgNoise > 20) aiLikelihood -= 15;

  if (flatRatio > 0.5) aiLikelihood += 25;
  else if (flatRatio > 0.35) aiLikelihood += 12;
  else if (flatRatio < 0.15) aiLikelihood -= 10;

  if (satStdDev < 0.08) aiLikelihood += 20;
  else if (satStdDev < 0.12) aiLikelihood += 8;

  aiLikelihood = Math.max(0, Math.min(100, aiLikelihood));

  return {
    noise_score: Math.round(avgNoise * 10) / 10,
    flat_region_ratio: Math.round(flatRatio * 1000) / 1000,
    saturation_uniformity: Math.round(satStdDev * 1000) / 1000,
    ai_likelihood: aiLikelihood,
  };
}

function checkPixelAnalysis(pa: PixelAnalysis | null, meta: MetadataReport, findings: ForensicFinding[]) {
  if (!pa) return;

  if (pa.ai_likelihood >= 50) {
    findings.push({
      label: 'Pixel patterns suggest AI generation',
      detail: `The image shows characteristics common in AI-generated content: ${pa.noise_score < 5 ? 'unusually smooth textures with very little natural noise' : 'unusual noise patterns'}${pa.flat_region_ratio > 0.4 ? ', large unnaturally uniform areas' : ''}${pa.saturation_uniformity < 0.1 ? ', and very uniform color saturation across the image' : ''}. Real photographs from cameras almost always have more varied textures and natural sensor noise.`,
      severity: 'warning',
    });
  } else if (pa.ai_likelihood >= 30) {
    findings.push({
      label: 'Some AI-like pixel characteristics',
      detail: `The image has some properties that can appear in AI-generated content (${pa.noise_score < 7 ? 'low noise levels' : 'unusual noise patterns'}${pa.flat_region_ratio > 0.3 ? ', smooth flat regions' : ''}), but these can also occur in heavily processed real photos or clean studio shots.`,
      severity: 'note',
    });
  } else if (pa.noise_score > 12) {
    findings.push({
      label: 'Natural sensor noise detected',
      detail: 'The image has noise patterns typical of a camera sensor. AI-generated images tend to be unnaturally smooth by comparison. This is a positive indicator for authenticity.',
      severity: 'info',
    });
  }
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
