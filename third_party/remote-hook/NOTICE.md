# Remote button hook: third-party components

Minimal Home's package includes two prebuilt binaries, taken unchanged from
[LG Input Hook](https://github.com/Simon34545/lginputhook) v1.5.1 (`service/inputhook/`), which this
repository pins as the `vendor/lginputhook` submodule.

| File | Project | Licence | Source |
| --- | --- | --- | --- |
| `ezinject` | ezinject, by Stefano Moioli (smx-smx) | Zlib (`ezinject-LICENSE.txt`) | https://github.com/smx-smx/ezinject |
| `libinputhookpp.so` | inputhookpp, by Sundermann | GPL-3.0 (`inputhookpp-LICENSE.txt`) | https://github.com/sundermann/inputhookpp |
| (inside `libinputhookpp.so`) | Frida Gum | wxWindows Library Licence 3.1 (`frida-gum-COPYING.txt`) | https://github.com/frida/frida-gum |

The binaries were built and published by the LG Input Hook project (BSD-3-Clause,
`lginputhook-LICENSE.md`). The source code of `libinputhookpp.so` is available from the inputhookpp
repository above; this repository does not modify it.
