# Bundled typefaces

Both families are licensed under the SIL Open Font License, Version 1.1, which
permits bundling them inside an application, including a commercial one, as
long as they are not sold on their own and the licence travels with them.

| Family | Weights bundled | Copyright | Licence |
| --- | --- | --- | --- |
| Geist | 400, 500, 600 | © 2023 Vercel, Inc. | SIL OFL 1.1 |
| Lora | 400, 500 | © 2011 Cyreal | SIL OFL 1.1 |

Files were taken from the `@expo-google-fonts/geist` and
`@expo-google-fonts/lora` packages, which redistribute the Google Fonts builds
unmodified. The full licence text ships with those packages and is available at
<https://openfontlicense.org>.

Geist carries the app's interface type; Lora is used only for the briefing's
editorial prose, which is the one place the product deliberately reads like a
piece of writing rather than a UI.

Regenerating or updating them:

```
npm pack @expo-google-fonts/geist @expo-google-fonts/lora
# copy 400Regular / 500Medium / 600SemiBold TTFs into this directory,
# renamed to Geist-Regular.ttf, Geist-Medium.ttf, Geist-SemiBold.ttf,
# Lora-Regular.ttf and Lora-Medium.ttf
```
