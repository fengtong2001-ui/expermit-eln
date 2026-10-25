// ExPermit for macOS —— 系统原生壳：WKWebView + 本地资源（app://local/）
// 数据（IndexedDB）存在应用自己的 WebKit 容器里，不上传；同步功能由网页自己完成。
import AppKit
import WebKit

// ─────────── 本地资源服务：把 bundle 里的 www/ 挂到 app://local/ ───────────

let MIME: [String: String] = [
  "html": "text/html", "js": "text/javascript", "mjs": "text/javascript", "css": "text/css",
  "json": "application/json", "webmanifest": "application/manifest+json", "svg": "image/svg+xml",
  "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "gif": "image/gif", "webp": "image/webp",
  "woff": "font/woff", "woff2": "font/woff2", "ttf": "font/ttf", "ico": "image/x-icon",
  "txt": "text/plain", "map": "application/json", "wasm": "application/wasm",
]

final class LocalSchemeHandler: NSObject, WKURLSchemeHandler {
  let root: URL

  init(root: URL) {
    self.root = root
  }

  func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
    let path = task.request.url?.path ?? "/"
    // 只允许读 www 内的相对路径，防目录穿越
    let rel = String(path.dropFirst(path.hasPrefix("/") ? 1 : 0))
    let base = rel.isEmpty || rel.hasSuffix("/") ? rel + "index.html" : rel
    let file = root.appendingPathComponent(base).standardizedFileURL
    guard file.path.hasPrefix(root.path) else {
      task.didFailWithError(NSError(domain: NSCocoaErrorDomain, code: NSFileReadNoSuchFileError))
      return
    }
    guard let data = FileManager.default.contents(atPath: file.path) else {
      task.didFailWithError(NSError(domain: NSCocoaErrorDomain, code: NSFileReadNoSuchFileError))
      return
    }
    let ext = (file.pathExtension as NSString).lowercased
    let mime = MIME[ext] ?? "application/octet-stream"
    let resp = HTTPURLResponse(url: task.request.url!, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": mime, "Cache-Control": "no-cache"])!
    task.didReceive(resp)
    task.didReceive(data)
    task.didFinish()
  }

  func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}
}

// ─────────── 应用 ───────────

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKScriptMessageHandler {
  var window: NSWindow!
  var web: WKWebView!
  var selftest = false
  var selftestDone = false

  func applicationDidFinishLaunching(_ n: Notification) {
    for arg in CommandLine.arguments where arg == "--selftest" { selftest = true }

    // 资源目录：默认用 bundle 里的 www；--www /path 指向开发构建
    var root = Bundle.main.resourceURL!.appendingPathComponent("www")
    let args = CommandLine.arguments
    if let i = args.firstIndex(of: "--www"), i + 1 < args.count {
      root = URL(fileURLWithPath: args[i + 1])
    }

    let config = WKWebViewConfiguration()
    config.setURLSchemeHandler(LocalSchemeHandler(root: root), forURLScheme: "app")
    config.defaultWebpagePreferences.allowsContentJavaScript = true
    config.userContentController.add(self, name: "selftest")

    // --sync '<json>'：在页面加载前把同步配置写进本应用沙盒的 localStorage
    if let i = args.firstIndex(of: "--sync"), i + 1 < args.count {
      let json = args[i + 1]
        .replacingOccurrences(of: "\\", with: "\\\\")
        .replacingOccurrences(of: "'", with: "\\'")
        .replacingOccurrences(of: "\n", with: "")
      let script = WKUserScript(
        source: "try { localStorage.setItem('eln-sync-config', '\(json)'); } catch (e) {}",
        injectionTime: .atDocumentStart,
        forMainFrameOnly: true
      )
      config.userContentController.addUserScript(script)
    }

    web = WKWebView(frame: .zero, configuration: config)
    web.navigationDelegate = self
    web.customUserAgent = web.customUserAgent // 保持默认
    web.load(URLRequest(url: URL(string: "app://local/index.html")!))

    window = NSWindow(
      contentRect: NSRect(x: 0, y: 0, width: 1240, height: 840),
      styleMask: [.titled, .closable, .miniaturizable, .resizable],
      backing: .buffered, defer: false
    )
    window.title = "ExPermit 实验记录本"
    window.minSize = NSSize(width: 960, height: 620)
    window.center()
    window.contentView = web
    window.makeKeyAndOrderFront(nil)

    buildMenu()

    if selftest {
      DispatchQueue.main.asyncAfter(deadline: .now() + 60) { self.finishSelftest(ok: false, detail: "timeout") }
    }
  }

  /// Edit 菜单是网页里 ⌘C/⌘V（孔板复制粘贴等）能进 WKWebView 的前提
  func buildMenu() {
    let main = NSMenu()
    let appMenuItem = NSMenuItem(title: "ExPermit", action: nil, keyEquivalent: "")
    let appMenu = NSMenu()
    appMenu.addItem(withTitle: "关于 ExPermit", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
    appMenu.addItem(.separator())
    appMenu.addItem(withTitle: "隐藏", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
    let quit = appMenu.addItem(withTitle: "退出 ExPermit", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
    quit.keyEquivalentModifierMask = .command
    appMenuItem.submenu = appMenu
    main.addItem(appMenuItem)

    let editMenuItem = NSMenuItem(title: "编辑", action: nil, keyEquivalent: "")
    let editMenu = NSMenu(title: "编辑")
    editMenu.addItem(withTitle: "剪切", action: Selector(("cut:")), keyEquivalent: "x")
    editMenu.addItem(withTitle: "拷贝", action: Selector(("copy:")), keyEquivalent: "c")
    editMenu.addItem(withTitle: "粘贴", action: Selector(("paste:")), keyEquivalent: "v")
    editMenu.addItem(withTitle: "全选", action: Selector(("selectAll:")), keyEquivalent: "a")
    editMenuItem.submenu = editMenu
    main.addItem(editMenuItem)
    NSApplication.shared.mainMenu = main
  }

  // 外链（比如 GitHub 同步说明页）交给系统浏览器；应用内只允许 app://local
  func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
    let url = navigationAction.request.url
    if navigationAction.targetFrame == nil, let url, url.scheme?.hasPrefix("http") == true {
      NSWorkspace.shared.open(url)
      decisionHandler(.cancel)
      return
    }
    if let url, url.scheme == "app" || url.scheme == "about" || url.scheme == "data" {
      decisionHandler(.allow)
    } else if let url, url.scheme?.hasPrefix("http") == true, navigationAction.targetFrame?.isMainFrame == true {
      NSWorkspace.shared.open(url)
      decisionHandler(.cancel)
    } else {
      decisionHandler(.allow)
    }
  }

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    guard selftest else { return }
    DispatchQueue.main.asyncAfter(deadline: .now() + 2) { self.runSelftest() }
  }

  func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
    if selftest { finishSelftest(ok: false, detail: "nav-error: \(error.localizedDescription)") }
  }

  // ─────────── 自检 ───────────

  func runSelftest() {
    // 结果经 WKScriptMessage 回传，绕开 evaluateJavaScript 的类型桥接
    let js = """
      (function(){
        function report(o){ window.webkit.messageHandlers.selftest.postMessage(JSON.stringify(o)); }
        try {
          var text = document.body.innerText || '';
          var rendered = text.indexOf('进行中的实验') >= 0 || text.indexOf('试剂库') >= 0;
          var req = indexedDB.open('expermit-eln');
          req.onsuccess = function(){
            fetch('https://api.github.com/rate_limit').then(function(r){
              report({rendered: rendered, indexedDB: true, github: r.status, title: document.title});
            }).catch(function(e){
              report({rendered: rendered, indexedDB: true, github: 'blocked: ' + e.message, title: document.title});
            });
          };
          req.onerror = function(){ report({rendered: rendered, indexedDB: false, title: document.title}); };
        } catch(e) { report({error: String(e)}); }
      })();
      """
    web.evaluateJavaScript(js, completionHandler: nil)
  }

  func finishSelftest(ok: Bool, detail: String) {
    guard !selftestDone else { return }
    selftestDone = true
    print("SELFTEST \(ok ? "OK" : "FAIL") \(detail)")
    exit(ok ? 0 : 2)
  }

  func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
    guard selftest else { return }
    let payload = String(describing: message.body)
    let ok = payload.contains("rendered\":true") && payload.contains("indexedDB\":true") && payload.contains("github\":200")
    finishSelftest(ok: ok, detail: payload)
  }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
