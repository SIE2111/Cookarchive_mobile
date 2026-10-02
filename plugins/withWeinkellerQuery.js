/**
 * Android 11+ beantwortet "Ist App X installiert?" (Linking.canOpenURL) nur
 * für Link-Schemata, die im Manifest unter <queries> angemeldet sind - sonst
 * immer mit "nein". Meldet meinweinkeller:// an, damit das Kochbuch die
 * Weinkarte nur zeigt, wenn Mein Weinkeller installiert ist.
 * (iOS: entspricht LSApplicationQueriesSchemes in app.json.)
 */
const { withAndroidManifest } = require('expo/config-plugins');

module.exports = function withWeinkellerQuery(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest.queries = manifest.queries || [{}];
    const q = manifest.queries[0];
    q.intent = q.intent || [];
    const exists = q.intent.some((i) => (i.data || []).some((d) => d.$ && d.$['android:scheme'] === 'meinweinkeller'));
    if (!exists) {
      q.intent.push({
        action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
        data: [{ $: { 'android:scheme': 'meinweinkeller' } }],
      });
    }
    return cfg;
  });
};
