/**
 * Shared image validation + client-side optimization + Supabase Storage
 * upload helper, used by Announcements and Gallery. Two-layer enforcement,
 * same principle as the RLS policies: this file is the client-side UX
 * layer (magic-byte sniff + resize before upload); the cms-media bucket's
 * allowedMimeTypes/fileSizeLimit (configured in the Supabase dashboard) is
 * the real server-side enforcement that a client can't bypass.
 */
(function () {
  "use strict";

  var MAX_DIMENSION = 1920;
  var WEBP_QUALITY = 0.82;
  var MAX_BYTES = 5 * 1024 * 1024;

  var SIGNATURES = [
    { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
    { mime: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
    { mime: "image/webp", bytes: [0x52, 0x49, 0x46, 0x46], secondary: { bytes: [0x57, 0x45, 0x42, 0x50], offset: 8 } }
  ];

  function readMagicBytes(file, length) {
    return file.slice(0, length).arrayBuffer().then(function (buffer) {
      return new Uint8Array(buffer);
    });
  }

  function matchesSignature(bytes, signature) {
    for (var i = 0; i < signature.bytes.length; i += 1) {
      if (bytes[(signature.offset || 0) + i] !== signature.bytes[i]) {
        return false;
      }
    }
    if (signature.secondary) {
      for (var j = 0; j < signature.secondary.bytes.length; j += 1) {
        if (bytes[signature.secondary.offset + j] !== signature.secondary.bytes[j]) {
          return false;
        }
      }
    }
    return true;
  }

  function detectImageType(file) {
    return readMagicBytes(file, 16).then(function (bytes) {
      var match = SIGNATURES.filter(function (signature) {
        return matchesSignature(bytes, signature);
      })[0];
      return match ? match.mime : null;
    });
  }

  function validateFile(file) {
    if (file.size > MAX_BYTES) {
      return Promise.resolve({ ok: false, message: window.AdminI18N.t("imageUpload.tooLarge") });
    }
    return detectImageType(file).then(function (detectedType) {
      if (!detectedType) {
        return { ok: false, message: window.AdminI18N.t("imageUpload.invalidType") };
      }
      return { ok: true, detectedType: detectedType };
    });
  }

  function loadImageBitmap(file) {
    if (window.createImageBitmap) {
      return window.createImageBitmap(file);
    }
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        resolve(img);
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  /** Downscales to MAX_DIMENSION on the long edge and re-encodes as WebP. */
  function optimizeImage(file) {
    return loadImageBitmap(file).then(function (bitmap) {
      var width = bitmap.width;
      var height = bitmap.height;
      var scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
      var targetWidth = Math.max(1, Math.round(width * scale));
      var targetHeight = Math.max(1, Math.round(height * scale));

      var canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      var ctx = canvas.getContext("2d");
      ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);

      return new Promise(function (resolve) {
        canvas.toBlob(
          function (blob) {
            resolve(blob || file);
          },
          "image/webp",
          WEBP_QUALITY
        );
      });
    });
  }

  function randomFileName(extension) {
    return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10) + "." + extension;
  }

  /**
   * Validates, optimizes, and uploads a File to the cms-media bucket under
   * `folder/`. Resolves { path, publicUrl }. Rejects with an Error whose
   * message is already a user-facing German string.
   */
  function uploadImage(file, folder) {
    return validateFile(file).then(function (validation) {
      if (!validation.ok) {
        return Promise.reject(new Error(validation.message));
      }

      return optimizeImage(file).then(function (optimizedBlob) {
        var path = folder + "/" + randomFileName("webp");
        var client = window.AdminSupabase.getClient();

        return client.storage
          .from("cms-media")
          .upload(path, optimizedBlob, { contentType: "image/webp", upsert: false })
          .then(function (result) {
            if (result.error) {
              return Promise.reject(new Error(window.AdminI18N.t("imageUpload.uploadFailed")));
            }
            var publicUrlResult = client.storage.from("cms-media").getPublicUrl(path);
            return { path: path, publicUrl: publicUrlResult.data.publicUrl };
          });
      });
    });
  }

  function deleteImage(path) {
    if (!path) {
      return Promise.resolve();
    }
    return window.AdminSupabase.getClient().storage.from("cms-media").remove([path]);
  }

  function getPublicUrl(path) {
    if (!path) {
      return null;
    }
    return window.AdminSupabase.getClient().storage.from("cms-media").getPublicUrl(path).data.publicUrl;
  }

  window.AdminImageUpload = {
    uploadImage: uploadImage,
    deleteImage: deleteImage,
    getPublicUrl: getPublicUrl
  };
})();
