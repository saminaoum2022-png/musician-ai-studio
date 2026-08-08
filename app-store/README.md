# App Store release package

Generated assets for NabadAi `1.0.3 (2)`:

- `metadata/en-US/` — English listing fields
- `metadata/ar-SA/` — Arabic listing fields
- `screenshots/en-US/` — captioned 6.9-inch screenshot set
- `screenshots/ar-SA/` — captioned Arabic screenshot set
- `screenshot-captions.json` — source captions

Regenerate with:

```sh
node scripts/build-app-store-metadata.mjs
node scripts/build-app-store-screenshots.mjs
```

## App Store Connect checklist

1. Create the public app version `1.0.3` and attach build `2` after processing.
2. Add English (U.S.) and Arabic (Saudi Arabia) localizations.
3. Paste each field from the matching metadata directory.
4. Upload screenshots in their numbered order.
5. Set the Music primary category and Social Networking secondary category.
6. Use:
   - Marketing URL: `https://www.nabadai.com/ai-music-generator`
   - Support URL: `https://www.nabadai.com/support`
   - Privacy URL: `https://www.nabadai.com/privacy`
7. Reconcile App Privacy answers with
   `docs/APP_STORE_PRIVACY_LABELS.md` and `ios/App/App/PrivacyInfo.xcprivacy`.
8. Verify Associated Domains is enabled for the App ID and signing profile.
9. Test `https://www.nabadai.com/s/<public-song-id>` on a physical iPhone.
10. Complete review notes and submit the public version for App Review.

TestFlight builds are not visible in App Store search. Search visibility begins
only after this public version is approved and released.

## iPad

The Xcode target currently supports iPhone and iPad. Before public submission,
capture an accurate iPad screenshot set from an iPad simulator. Do not resize
iPhone screenshots and present them as native iPad UI. If iPad support is not
intended for version 1.0.3, change the target device family deliberately and
rebuild before submission.
