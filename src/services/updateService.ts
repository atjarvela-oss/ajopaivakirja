export const APP_VERSION: string = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0';

export const DEFAULT_GITHUB_REPO = 'atjarvela-oss/ajopaivakirja';
const STORAGE_REPO_KEY = 'opetuslupa_github_repo';

export interface UpdateCheckResult {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseName: string;
  releaseNotes: string;
  downloadUrl: string;
  publishedAt?: string;
  error?: string;
}

export function getGitHubRepo(): string {
  return localStorage.getItem(STORAGE_REPO_KEY) || DEFAULT_GITHUB_REPO;
}

export function saveGitHubRepo(repo: string): void {
  localStorage.setItem(STORAGE_REPO_KEY, repo.trim());
}

/**
 * Vertailee versionumeroita.
 * Tukee muotoa 1.VVVVKKPP.TTMM (esim. 1.20260908.0945) sekä normaaleja semver-numeroita.
 * Palauttaa true jos remoteVer on uudempi kuin currentVer.
 */
export function isNewerVersion(remoteVer: string, currentVer: string): boolean {
  const clean = (v: string) => v.replace(/^v/i, '').trim();
  const rParts = clean(remoteVer).split('.').map((p) => parseInt(p, 10) || 0);
  const cParts = clean(currentVer).split('.').map((p) => parseInt(p, 10) || 0);

  const maxLen = Math.max(rParts.length, cParts.length);
  for (let i = 0; i < maxLen; i++) {
    const r = rParts[i] ?? 0;
    const c = cParts[i] ?? 0;
    if (r > c) return true;
    if (r < c) return false;
  }
  return false;
}

/**
 * Tarkistaa GitHub Releases API:sta onko uudempaa julkaisua saatavilla.
 */
export async function checkForAppUpdate(targetRepo = getGitHubRepo()): Promise<UpdateCheckResult> {
  try {
    const repoClean = targetRepo.trim();
    if (!repoClean) {
      return {
        hasUpdate: false,
        currentVersion: APP_VERSION,
        latestVersion: APP_VERSION,
        releaseName: '',
        releaseNotes: '',
        downloadUrl: '',
        error: 'GitHub-repositoriota ei ole määritetty.',
      };
    }

    const response = await fetch(`https://api.github.com/repos/${repoClean}/releases/latest`, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (response.status === 404) {
      return {
        hasUpdate: false,
        currentVersion: APP_VERSION,
        latestVersion: APP_VERSION,
        releaseName: '',
        releaseNotes: '',
        downloadUrl: '',
        error: 'Repositoriossa ei ole vielä julkaisuja (Releases).',
      };
    }

    if (!response.ok) {
      throw new Error(`GitHub API virhe: ${response.status} ${response.statusText}`);
    }

    const release = await response.json();
    const rawTag = release.tag_name || '';
    const latestVersion = rawTag.replace(/^v/i, '');

    // Etsitään julkaisun liitteistä APK-tiedosto
    let downloadUrl = release.html_url || `https://github.com/${repoClean}/releases/latest`;
    if (Array.isArray(release.assets) && release.assets.length > 0) {
      const apkAsset = release.assets.find(
        (a: any) => typeof a.name === 'string' && a.name.toLowerCase().endsWith('.apk')
      );
      if (apkAsset && apkAsset.browser_download_url) {
        downloadUrl = apkAsset.browser_download_url;
      }
    }

    const hasUpdate = isNewerVersion(latestVersion, APP_VERSION);

    return {
      hasUpdate,
      currentVersion: APP_VERSION,
      latestVersion,
      releaseName: release.name || rawTag,
      releaseNotes: release.body || '',
      downloadUrl,
      publishedAt: release.published_at,
    };
  } catch (err: any) {
    console.warn('[UpdateService] Tarkistus epäonnistui:', err);
    return {
      hasUpdate: false,
      currentVersion: APP_VERSION,
      latestVersion: APP_VERSION,
      releaseName: '',
      releaseNotes: '',
      downloadUrl: '',
      error: err?.message || 'Päivitystarkistus epäonnistui',
    };
  }
}

/**
 * Avaa päivityksen latauslinkin käyttäjän selaimessa / järjestelmässä.
 */
export function openUpdateDownload(url: string): void {
  if (!url) return;
  window.open(url, '_system');
}
