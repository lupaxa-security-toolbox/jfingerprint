<p align="center">
  <a href="https://github.com/lupaxa-security-toolbox">
    <img src="https://raw.githubusercontent.com/the-lupaxa-project/brand-assets/master/logos/organisations/security-toolbox/readme-logo.png" alt="Security Toolbox" />
  </a>
</p>

<h1 align="center">jFingerprint</h1>

jFingerprint builds a SHA-256 hash from the slow-moving signals a page can already read: canvas, audio, emoji, fonts, the GPU, the display, the hardware, the locale, speech voices, and hardware-backed media keys.

Browser version stays out of the hash unless you pass `{ build: true }`. The network, the window, and this site's storage are not collected. Nothing is uploaded.

## Quick Start

```html
<script src="jfingerprint.js"></script>
<script>
  jFingerprint.getHash().then((hash) => {
    console.log(hash);
  });
</script>
```

`getRAW` returns the object that was hashed. `getJSON` returns its canonical JSON. `getHash` is the SHA-256 of that JSON.

Pass `{ canvas: false }` to leave a section out. The same switch works for `fonts`, `gpu`, `audio`, `emoji`, `voices`, `display`, `hardware`, `locale`, and `trust`.

<a href="https://github.com/the-lupaxa-project">
    <img src="https://raw.githubusercontent.com/the-lupaxa-project/brand-assets/master/logos/components/footer-for-child-orgs.svg" alt="The Lupaxa Project Footer" width="100%" />
</a>
