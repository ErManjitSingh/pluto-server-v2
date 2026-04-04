/**
 * Resolve WhatsApp Cloud API media id to a temporary download URL (requires app access token).
 * https://developers.facebook.com/docs/whatsapp/cloud-api/reference/media
 */
export async function fetchWhatsappMediaDownloadUrl(mediaId, accessToken) {
  if (!mediaId || !accessToken) return null;
  try {
    const r = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(mediaId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await r.json();
    if (!r.ok || !data.url) return null;
    return String(data.url);
  } catch (e) {
    console.error('fetchWhatsappMediaDownloadUrl:', e?.message || e);
    return null;
  }
}
