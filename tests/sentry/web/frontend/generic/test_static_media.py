import os

from django.conf import settings
from django.test.utils import override_settings

from sentry import options
from sentry.testutils import TestCase
from sentry.utils import json
from sentry.utils.assets import get_webpack_asset_url
from sentry.web.frontend.generic import FOREVER_CACHE, NEVER_CACHE


class StaticMediaTest(TestCase):
    @override_settings(DEBUG=False)
    def test_basic(self):
        url = "/_static/sentry/js/ads.js"
        response = self.client.get(url)
        assert response.status_code == 200, response
        assert response["Cache-Control"] == NEVER_CACHE
        assert response["Vary"] == "Accept-Encoding"
        assert response["Access-Control-Allow-Origin"] == "*"
        assert "Content-Encoding" not in response

    @override_settings(DEBUG=False)
    def test_versioned(self):
        url = "/_static/1234567890/sentry/js/ads.js"
        response = self.client.get(url)
        assert response.status_code == 200, response
        assert response["Cache-Control"] == FOREVER_CACHE
        assert response["Vary"] == "Accept-Encoding"
        assert response["Access-Control-Allow-Origin"] == "*"
        assert "Content-Encoding" not in response

        url = "/_static/a43db3b08ddd4918972f80739f15344b/sentry/js/ads.js"
        response = self.client.get(url)
        assert response.status_code == 200, response
        assert response["Cache-Control"] == FOREVER_CACHE
        assert response["Vary"] == "Accept-Encoding"
        assert response["Access-Control-Allow-Origin"] == "*"
        assert "Content-Encoding" not in response

        with override_settings(DEBUG=True):
            response = self.client.get(url)
            assert response.status_code == 200, response
            assert response["Cache-Control"] == NEVER_CACHE
            assert response["Vary"] == "Accept-Encoding"
            assert response["Access-Control-Allow-Origin"] == "*"

    @override_settings(DEBUG=False)
    def test_webpack_assets(self):
        """
        manifest here refers to the webpack manifest for frontend assets
        """

        app_manifest = {
            "app.js": "app.f00f00.js",
        }

        with self.static_asset_manifest(app_manifest):
            # `get_manifest_url()` should return the mapped filename
            url = get_webpack_asset_url("sentry", "app.js")

            response = self.client.get(url)
            assert response.status_code == 200, response
            assert response["Cache-Control"] == FOREVER_CACHE
            assert response["Vary"] == "Accept-Encoding"
            assert response["Access-Control-Allow-Origin"] == "*"
            assert "Content-Encoding" not in response

            # non-existant dist file
            response = self.client.get("/_static/dist/sentry/invalid.js")
            assert response.status_code == 404, response

            with override_settings(DEBUG=True):
                response = self.client.get(url)
                assert response.status_code == 200, response
                assert response["Cache-Control"] == NEVER_CACHE
                assert response["Vary"] == "Accept-Encoding"
                assert response["Access-Control-Allow-Origin"] == "*"

    @override_settings(DEBUG=False)
    def test_webpack_assets_runtime_manifest(self):
        """
        uses manifest from `sentry.options` instead of from `manifest.json` on the filesytem
        """

        app_manifest_fs = {
            "app.js": "app.f00f00.js",
        }

        app_manifest_db = {
            "app.js": "app.bar.js",
        }

        options.set(settings.FRONTEND_MANIFEST_KEY, json.dumps(app_manifest_db))

        # We still write to filesystem to ensure that it is not accessed
        with self.static_asset_manifest(app_manifest_fs):
            # `get_webpack_asset_url()` should return the mapped filename from db
            url = get_webpack_asset_url("sentry", "app.js")

            assert url == "/_static/dist/sentry/app.bar.js"

    @override_settings(DEBUG=False)
    def test_webpack_assets_invalid_manifest(self):
        """
        fallback to filesystem manifest if we have an invalid manifest from options
        """

        app_manifest_fs = {
            "app.js": "app.f00f00.js",
        }

        app_manifest_db = {
            "app.js": "app.bar.js",
        }

        # The following won't be valid json and will not be decodeable
        options.set(settings.FRONTEND_MANIFEST_KEY, json.dumps(app_manifest_db) + "_invalid")

        with self.static_asset_manifest(app_manifest_fs):
            url = get_webpack_asset_url("sentry", "app.js")

            assert url == "/_static/dist/sentry/app.f00f00.js"

    @override_settings(DEBUG=False)
    def test_no_cors(self):
        url = "/_static/sentry/images/favicon.ico"
        response = self.client.get(url)
        assert response.status_code == 200, response
        assert response["Cache-Control"] == NEVER_CACHE
        assert response["Vary"] == "Accept-Encoding"
        assert "Access-Control-Allow-Origin" not in response
        assert "Content-Encoding" not in response

    def test_404(self):
        url = "/_static/sentry/app/thisfiledoesnotexistlol.js"
        response = self.client.get(url)
        assert response.status_code == 404, response

    def test_gzip(self):
        url = "/_static/sentry/js/ads.js"
        response = self.client.get(url, HTTP_ACCEPT_ENCODING="gzip,deflate")
        assert response.status_code == 200, response
        assert response["Vary"] == "Accept-Encoding"
        assert "Content-Encoding" not in response

        try:
            open("src/sentry/static/sentry/js/ads.js.gz", "a").close()

            # Not a gzip Accept-Encoding, so shouldn't serve gzipped file
            response = self.client.get(url, HTTP_ACCEPT_ENCODING="lol")
            assert response.status_code == 200, response
            assert response["Vary"] == "Accept-Encoding"
            assert "Content-Encoding" not in response

            response = self.client.get(url, HTTP_ACCEPT_ENCODING="gzip,deflate")
            assert response.status_code == 200, response
            assert response["Vary"] == "Accept-Encoding"
            assert response["Content-Encoding"] == "gzip"
        finally:
            try:
                os.unlink("src/sentry/static/sentry/js/ads.js.gz")
            except Exception:
                pass

    def test_file_not_found(self):
        url = "/_static/sentry/app/xxxxxxxxxxxxxxxxxxxxxxxx.js"
        response = self.client.get(url)
        assert response.status_code == 404, response

    def test_bad_access(self):
        url = "/_static/sentry/images/../../../../../etc/passwd"
        response = self.client.get(url)
        assert response.status_code == 404, response

    def test_directory(self):
        url = "/_static/sentry/images/"
        response = self.client.get(url)
        assert response.status_code == 404, response

        url = "/_static/sentry/images"
        response = self.client.get(url)
        assert response.status_code == 404, response
