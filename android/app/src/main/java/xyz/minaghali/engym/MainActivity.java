package xyz.minaghali.engym;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.provider.MediaStore;
import android.webkit.CookieManager;
import android.view.WindowInsets;
import android.graphics.Insets;
import android.webkit.ServiceWorkerClient;
import android.webkit.ServiceWorkerController;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.core.content.FileProvider;
import androidx.webkit.WebViewAssetLoader;
import java.io.File;
import java.io.IOException;
import java.util.HashMap;
import java.util.Map;

public class MainActivity extends Activity {
 private static final String HOST = "engym.minaghali.xyz";
 private static final int PICK_IMAGE = 41;
 private WebView webView;
 private WebViewAssetLoader assets;
 private ValueCallback<Uri[]> upload;
 private Uri cameraUri;
 private File cameraFile;

 @Override public void onCreate(Bundle state) {
  super.onCreate(state);
  getWindow().setStatusBarColor(0xff111317);
  getWindow().setNavigationBarColor(0xff111317);
  assets = new WebViewAssetLoader.Builder().setDomain(HOST)
   .addPathHandler("/",new WebViewAssetLoader.AssetsPathHandler(this)).build();
  webView = new WebView(this);
  webView.setBackgroundColor(0xff111317);
  WebSettings settings = webView.getSettings();
  settings.setJavaScriptEnabled(true);
  settings.setDomStorageEnabled(true);
  settings.setAllowFileAccess(false);
  settings.setAllowContentAccess(true);
  settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
  settings.setSafeBrowsingEnabled(true);
  settings.setUserAgentString(settings.getUserAgentString()+" EngymAndroid/1.0.0");
  CookieManager.getInstance().setAcceptCookie(true);
  CookieManager.getInstance().setAcceptThirdPartyCookies(webView,false);
  webView.setWebViewClient(new WebViewClient() {
   @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request) {
    return bundled(request);
   }
   @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request) {
    Uri uri=request.getUrl();
    if("https".equals(uri.getScheme()) && HOST.equals(uri.getHost())) return false;
    if(request.isForMainFrame() && "https".equals(uri.getScheme())) {
     try { startActivity(new Intent(Intent.ACTION_VIEW,uri)); } catch(Exception ignored) { }
    }
    return true;
   }
  });
  ServiceWorkerController.getInstance().setServiceWorkerClient(new ServiceWorkerClient() {
   @Override public WebResourceResponse shouldInterceptRequest(WebResourceRequest request) { return bundled(request); }
  });
  webView.setWebChromeClient(new WebChromeClient() {
   @Override public boolean onShowFileChooser(WebView view,ValueCallback<Uri[]> callback,FileChooserParams params) {
    if(upload!=null) upload.onReceiveValue(null);
    upload=callback;
    Intent picker=new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("image/*").addCategory(Intent.CATEGORY_OPENABLE);
    Intent chooser=Intent.createChooser(picker,"Workout or profile photo");
    Intent capture=new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
    if(capture.resolveActivity(getPackageManager())!=null) {
     try {
      cameraFile=File.createTempFile("engym-photo-",".jpg",getCacheDir());
      cameraUri=FileProvider.getUriForFile(MainActivity.this,getPackageName()+".photos",cameraFile);
      capture.putExtra(MediaStore.EXTRA_OUTPUT,cameraUri);
      capture.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
      chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS,new Intent[]{capture});
     } catch(IOException ignored) { cameraUri=null; }
    }
    try { startActivityForResult(chooser,PICK_IMAGE); }
    catch(Exception error) { upload.onReceiveValue(null);upload=null; }
    return true;
   }
  });
  setContentView(webView);
  if(android.os.Build.VERSION.SDK_INT>=30) {
   webView.setOnApplyWindowInsetsListener((view,insets)->{
    Insets bars=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout());
    Insets keyboard=insets.getInsets(WindowInsets.Type.ime());
    view.setPadding(bars.left,bars.top,bars.right,Math.max(bars.bottom,keyboard.bottom));
    return WindowInsets.CONSUMED;
   });
   webView.requestApplyInsets();
  }

  if(state==null || webView.restoreState(state)==null)webView.loadUrl("https://"+HOST+"/feed.html");
 }
 private WebResourceResponse bundled(WebResourceRequest request) {
  Uri uri=request.getUrl();String path=uri.getPath();
  if(!"https".equals(uri.getScheme()) || !HOST.equals(uri.getHost()) || !"GET".equals(request.getMethod()))return null;
  if(path!=null && path.startsWith("/api/"))return null;
  if(path==null || path.equals("/"))uri=Uri.parse("https://"+HOST+"/index.html");
  WebResourceResponse response=assets.shouldInterceptRequest(uri);
  if(response!=null) {
   if(path!=null && (path.endsWith(".js")||path.endsWith(".mjs")))response.setMimeType("text/javascript");
   Map<String,String> headers=new HashMap<>();
   headers.put("Cache-Control","no-cache");
   headers.put("Content-Security-Policy","default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
   response.setResponseHeaders(headers);
  }
  return response;
 }
 @Override protected void onActivityResult(int requestCode,int resultCode,Intent data) {
  super.onActivityResult(requestCode,resultCode,data);
  if(requestCode!=PICK_IMAGE||upload==null)return;
  Uri[] result=null;
  if(resultCode==RESULT_OK) {
   if(data!=null&&data.getData()!=null)result=new Uri[]{data.getData()};
   else if(cameraUri!=null&&cameraFile!=null&&cameraFile.length()>0)result=new Uri[]{cameraUri};
  }
  upload.onReceiveValue(result);upload=null;
  if((result==null||result[0]!=cameraUri)&&cameraFile!=null)cameraFile.delete();
  cameraUri=null;cameraFile=null;
 }
 @Override protected void onSaveInstanceState(Bundle state) { webView.saveState(state);super.onSaveInstanceState(state); }
 @Override protected void onPause() { super.onPause();CookieManager.getInstance().flush(); }
 @Override public void onBackPressed() { if(webView.canGoBack())webView.goBack();else super.onBackPressed(); }
 @Override protected void onDestroy() { if(upload!=null){upload.onReceiveValue(null);upload=null;}webView.destroy();super.onDestroy(); }
}
