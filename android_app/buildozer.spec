[app]
title = Saldo
package.name = saldo
package.domain = br.com.saldo
source.dir = .
source.include_exts = py,kv,png,jpg,atlas,json,md
source.exclude_dirs = tests,__pycache__
version = 0.2.0
requirements = python3,kivy==2.3.1
orientation = portrait
fullscreen = 0
android.api = 35
android.minapi = 23
android.ndk = 27c
android.accept_sdk_license = True
android.archs = arm64-v8a
android.allow_backup = False
android.release_artifact = aab

[buildozer]
log_level = 2
warn_on_root = 1