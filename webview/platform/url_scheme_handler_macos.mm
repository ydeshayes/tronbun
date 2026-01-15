/**
 * Custom URL Scheme Handler Implementation for macOS
 *
 * Implements WKURLSchemeHandler to intercept tronbun:// requests
 * and serve content from the virtual file system.
 */

#ifdef __APPLE__

#import "url_scheme_handler_macos.h"
#import "virtual_fs.h"
#import <Foundation/Foundation.h>

@implementation TronbunURLSchemeHandler

- (void)webView:(WKWebView *)webView startURLSchemeTask:(id<WKURLSchemeTask>)urlSchemeTask {
    NSURL *url = urlSchemeTask.request.URL;
    NSString *path = url.path;

    // Remove leading slash if present
    if ([path hasPrefix:@"/"]) {
        path = [path substringFromIndex:1];
    }

    // Handle empty path as index.html
    if (path.length == 0) {
        path = @"index.html";
    }

    const char *pathCStr = [path UTF8String];
    const char *content = NULL;
    size_t contentLength = 0;

    // Look up file in virtual file system
    if (virtual_fs_get_file(pathCStr, &content, &contentLength) == 0) {
        // File found - create response
        const char *mimeType = virtual_fs_get_mime_type(pathCStr);

        NSData *data = [NSData dataWithBytes:content length:contentLength];
        NSString *mimeTypeStr = [NSString stringWithUTF8String:mimeType];

        // Create HTTP response
        NSHTTPURLResponse *response = [[NSHTTPURLResponse alloc]
            initWithURL:url
            statusCode:200
            HTTPVersion:@"HTTP/1.1"
            headerFields:@{
                @"Content-Type": mimeTypeStr,
                @"Content-Length": [NSString stringWithFormat:@"%zu", contentLength],
                @"Cache-Control": @"no-cache"
            }];

        [urlSchemeTask didReceiveResponse:response];
        [urlSchemeTask didReceiveData:data];
        [urlSchemeTask didFinish];

        NSLog(@"[TronbunScheme] Served: %@ (%zu bytes)", path, contentLength);
    } else {
        // File not found - return 404
        NSLog(@"[TronbunScheme] Not found: %@", path);

        NSString *errorBody = [NSString stringWithFormat:@"File not found: %@", path];
        NSData *errorData = [errorBody dataUsingEncoding:NSUTF8StringEncoding];

        NSHTTPURLResponse *response = [[NSHTTPURLResponse alloc]
            initWithURL:url
            statusCode:404
            HTTPVersion:@"HTTP/1.1"
            headerFields:@{
                @"Content-Type": @"text/plain; charset=utf-8",
                @"Content-Length": [NSString stringWithFormat:@"%lu", (unsigned long)errorData.length]
            }];

        [urlSchemeTask didReceiveResponse:response];
        [urlSchemeTask didReceiveData:errorData];
        [urlSchemeTask didFinish];
    }
}

- (void)webView:(WKWebView *)webView stopURLSchemeTask:(id<WKURLSchemeTask>)urlSchemeTask {
    // Nothing to do - we complete synchronously
}

@end

extern "C" void tronbun_register_url_scheme(void* configPtr) {
    WKWebViewConfiguration* config = (__bridge WKWebViewConfiguration*)configPtr;
    // Initialize virtual file system if not already done
    virtual_fs_init();

    // Create and register the scheme handler
    TronbunURLSchemeHandler *handler = [[TronbunURLSchemeHandler alloc] init];
    [config setURLSchemeHandler:handler forURLScheme:@"tronbun"];

    NSLog(@"[TronbunScheme] Registered tronbun:// URL scheme handler");
}

#endif // __APPLE__
