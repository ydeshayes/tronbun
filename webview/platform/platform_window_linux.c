#ifdef __linux__
#include <gtk/gtk.h>
#include <gdk/gdk.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "platform_window.h"
#include "../../vendors/cJSON/cJSON.h"

// Global storage for context menu data
static char* contextMenuJson = NULL;

// Helper function to recursively find WebKit webview instances (similar to macOS approach)
static void findWebKitWebViewsInContainer(GtkContainer *container, GList **webviews) {
    if (!container || !webviews) return;
    
    GList *children = gtk_container_get_children(container);
    for (GList *l = children; l != NULL; l = l->next) {
        GtkWidget *child = GTK_WIDGET(l->data);
        
        // Check if this is a WebKit webview
        const char *type_name = G_OBJECT_TYPE_NAME(child);
        if (type_name && strstr(type_name, "WebKitWebView")) {
            *webviews = g_list_append(*webviews, child);
        }
        
        // Recursively search in containers
        if (GTK_IS_CONTAINER(child)) {
            findWebKitWebViewsInContainer(GTK_CONTAINER(child), webviews);
        }
    }
    g_list_free(children);
}

void platform_window_set_transparent(void *native_window) {
    GtkWidget *win = GTK_WIDGET(native_window);
    if (win && GTK_IS_WINDOW(win)) {
        gtk_widget_set_app_paintable(win, TRUE);
        
        GdkScreen *screen = gtk_widget_get_screen(win);
        GdkVisual *visual = gdk_screen_get_rgba_visual(screen);
        
        if (visual) {
            gtk_widget_set_visual(win, visual);
        }
        
        // Set transparent background
        GdkRGBA transparent = {0.0, 0.0, 0.0, 0.0};
        gtk_widget_override_background_color(win, GTK_STATE_FLAG_NORMAL, &transparent);
    }
}

void platform_window_set_opaque(void *native_window) {
    GtkWidget *win = GTK_WIDGET(native_window);
    if (win && GTK_IS_WINDOW(win)) {
        // Disable app paintable to use default window background
        gtk_widget_set_app_paintable(win, FALSE);
        
        // Reset to default visual (non-RGBA)
        GdkScreen *screen = gtk_widget_get_screen(win);
        GdkVisual *visual = gdk_screen_get_system_visual(screen);
        
        if (visual) {
            gtk_widget_set_visual(win, visual);
        }
        
        // Reset background color to default (removes override)
        gtk_widget_override_background_color(win, GTK_STATE_FLAG_NORMAL, NULL);
        
        // Set full opacity
        gtk_widget_set_opacity(win, 1.0);
        
        // Remove window type hint that might affect transparency
        GdkWindow *gdk_window = gtk_widget_get_window(win);
        if (gdk_window) {
            gdk_window_set_type_hint(gdk_window, GDK_WINDOW_TYPE_HINT_NORMAL);
        }
    }
}

void platform_window_enable_blur(void *native_window) {
    GtkWidget *win = GTK_WIDGET(native_window);
    if (win && GTK_IS_WINDOW(win)) {
        // GTK doesn't have built-in blur support like macOS or Windows
        // This would require compositor support and is highly desktop environment dependent
        // For now, we'll just enable transparency which is a prerequisite for blur
        platform_window_set_transparent(native_window);
        
        // Note: Real blur would require:
        // 1. Setting window type hints for compositor
        // 2. Using CSS providers for GTK4
        // 3. Or using X11/Wayland specific APIs
        
        // Example for setting window type hint (may help with some compositors):
        GdkWindow *gdk_window = gtk_widget_get_window(win);
        if (gdk_window) {
            gdk_window_set_type_hint(gdk_window, GDK_WINDOW_TYPE_HINT_UTILITY);
        }
    }
}

void platform_window_remove_decorations(void *native_window) {
    GtkWidget *win = GTK_WIDGET(native_window);
    if (win && GTK_IS_WINDOW(win)) {
        gtk_window_set_decorated(GTK_WINDOW(win), FALSE);
    }
}

void platform_window_add_decorations(void *native_window) {
    GtkWidget *win = GTK_WIDGET(native_window);
    if (win && GTK_IS_WINDOW(win)) {
        gtk_window_set_decorated(GTK_WINDOW(win), TRUE);
    }
}

void platform_window_set_always_on_top(void *native_window, int on_top) {
    GtkWidget *win = GTK_WIDGET(native_window);
    if (win && GTK_IS_WINDOW(win)) {
        gtk_window_set_keep_above(GTK_WINDOW(win), on_top ? TRUE : FALSE);
    }
}

void platform_window_set_opacity(void *native_window, float opacity) {
    GtkWidget *win = GTK_WIDGET(native_window);
    if (win && GTK_IS_WINDOW(win)) {
        // Clamp opacity between 0.0 and 1.0
        if (opacity < 0.0f) opacity = 0.0f;
        if (opacity > 1.0f) opacity = 1.0f;
        
        gtk_widget_set_opacity(win, opacity);
    }
}

void platform_window_set_resizable(void *native_window, int resizable) {
    GtkWidget *win = GTK_WIDGET(native_window);
    if (win && GTK_IS_WINDOW(win)) {
        gtk_window_set_resizable(GTK_WINDOW(win), resizable ? TRUE : FALSE);
    }
}

void platform_window_set_position(void *native_window, int x, int y) {
    GtkWidget *win = GTK_WIDGET(native_window);
    if (win && GTK_IS_WINDOW(win)) {
        gtk_window_move(GTK_WINDOW(win), x, y);
    }
}

void platform_window_center(void *native_window) {
    GtkWidget *win = GTK_WIDGET(native_window);
    if (win && GTK_IS_WINDOW(win)) {
        gtk_window_set_position(GTK_WINDOW(win), GTK_WIN_POS_CENTER);
    }
}

void platform_window_minimize(void *native_window) {
    GtkWidget *win = GTK_WIDGET(native_window);
    if (win && GTK_IS_WINDOW(win)) {
        gtk_window_iconify(GTK_WINDOW(win));
    }
}

void platform_window_maximize(void *native_window) {
    GtkWidget *win = GTK_WIDGET(native_window);
    if (win && GTK_IS_WINDOW(win)) {
        gtk_window_maximize(GTK_WINDOW(win));
    }
}

void platform_window_restore(void *native_window) {
    GtkWidget *win = GTK_WIDGET(native_window);
    if (win && GTK_IS_WINDOW(win)) {
        gtk_window_unmaximize(GTK_WINDOW(win));
        gtk_window_deiconify(GTK_WINDOW(win));
        gtk_window_present(GTK_WINDOW(win));
    }
}

void platform_window_hide(void *native_window) {
    GtkWidget *win = GTK_WIDGET(native_window);
    if (win && GTK_IS_WINDOW(win)) {
        gtk_widget_hide(win);
    }
}

void platform_window_show(void *native_window) {
    GtkWidget *win = GTK_WIDGET(native_window);
    if (win && GTK_IS_WINDOW(win)) {
        gtk_widget_show(win);
        gtk_window_present(GTK_WINDOW(win));
    }
}

// Simple JSON parser for menu items (basic implementation)
typedef struct {
    char id[256];
    char label[256];
    char type[64];
    int enabled;
} MenuItemData;

static int parseMenuItems(const char* json, MenuItemData* items, int maxItems) {
    if (!json || !items) return 0;
    
    cJSON *root = cJSON_Parse(json);
    if (!root) {
        fprintf(stderr, "Failed to parse JSON: %s\n", cJSON_GetErrorPtr());
        return 0;
    }
    
    if (!cJSON_IsArray(root)) {
        fprintf(stderr, "JSON root is not an array\n");
        cJSON_Delete(root);
        return 0;
    }
    
    int count = 0;
    int arraySize = cJSON_GetArraySize(root);
    
    for (int i = 0; i < arraySize && count < maxItems; i++) {
        cJSON *item = cJSON_GetArrayItem(root, i);
        if (!cJSON_IsObject(item)) {
            continue;
        }
        
        // Initialize item
        memset(&items[count], 0, sizeof(MenuItemData));
        items[count].enabled = 1; // Default to enabled
        
        // Extract id
        cJSON *id = cJSON_GetObjectItem(item, "id");
        if (cJSON_IsString(id) && id->valuestring) {
            strncpy(items[count].id, id->valuestring, sizeof(items[count].id) - 1);
        }
        
        // Extract label
        cJSON *label = cJSON_GetObjectItem(item, "label");
        if (cJSON_IsString(label) && label->valuestring) {
            strncpy(items[count].label, label->valuestring, sizeof(items[count].label) - 1);
        }
        
        // Extract type
        cJSON *type = cJSON_GetObjectItem(item, "type");
        if (cJSON_IsString(type) && type->valuestring) {
            strncpy(items[count].type, type->valuestring, sizeof(items[count].type) - 1);
        }
        
        // Extract enabled
        cJSON *enabled = cJSON_GetObjectItem(item, "enabled");
        if (cJSON_IsBool(enabled)) {
            items[count].enabled = cJSON_IsTrue(enabled) ? 1 : 0;
        }
        
        count++;
    }
    
    cJSON_Delete(root);
    return count;
}

// Callback for menu item activation
static void menu_item_activated(GtkMenuItem *menuitem, gpointer user_data) {
    const char* itemId = (const char*)user_data;
    if (itemId) {
        // Send context menu click event to stdout for IPC using cJSON
        cJSON *event = cJSON_CreateObject();
        cJSON *type = cJSON_CreateString("context_menu_click");
        cJSON *id = cJSON_CreateString(itemId);
        
        cJSON_AddItemToObject(event, "type", type);
        cJSON_AddItemToObject(event, "id", id);
        
        char *json_string = cJSON_Print(event);
        if (json_string) {
            printf("%s\n", json_string);
            fflush(stdout);
            free(json_string);
        }
        
        cJSON_Delete(event);
    }
}

// Right-click event handler for webview (similar to macOS approach)
static gboolean webview_button_press_event(GtkWidget *widget, GdkEventButton *event, gpointer user_data) {
    if (event->type == GDK_BUTTON_PRESS && event->button == 3) { // Right mouse button
        if (!contextMenuJson) {
            // No custom menu, use default behavior
            return FALSE;
        }
        
        // Parse menu items and create menu dynamically (like macOS approach)
        MenuItemData items[32];
        int itemCount = parseMenuItems(contextMenuJson, items, 32);
        
        if (itemCount == 0) {
            // No custom menu, use default behavior
            return FALSE;
        }
        
        // Create custom context menu dynamically
        GtkWidget *customMenu = gtk_menu_new();
        
        for (int i = 0; i < itemCount; i++) {
            if (strcmp(items[i].type, "separator") == 0) {
                GtkWidget *separator = gtk_separator_menu_item_new();
                gtk_menu_shell_append(GTK_MENU_SHELL(customMenu), separator);
                gtk_widget_show(separator);
            } else {
                GtkWidget *menuItem = gtk_menu_item_new_with_label(items[i].label);
                gtk_widget_set_sensitive(menuItem, items[i].enabled);
                
                // Store the item ID as user data
                char *itemId = strdup(items[i].id);
                g_object_set_data_full(G_OBJECT(menuItem), "item_id", itemId, free);
                
                g_signal_connect(menuItem, "activate", G_CALLBACK(menu_item_activated), itemId);
                
                gtk_menu_shell_append(GTK_MENU_SHELL(customMenu), menuItem);
                gtk_widget_show(menuItem);
            }
        }
        
        // Show the custom menu at the click location
        gtk_menu_popup(GTK_MENU(customMenu), NULL, NULL, NULL, NULL, event->button, event->time);
        
        return TRUE; // Event handled
    }
    
    return FALSE; // Let other handlers process the event
}

void platform_window_set_context_menu(void *native_window, const char *menu_json) {
    GtkWidget *win = GTK_WIDGET(native_window);
    if (!win || !menu_json) {
        fprintf(stderr, "platform_window_set_context_menu: Invalid parameters\n");
        return;
    }
    
    fprintf(stderr, "platform_window_set_context_menu: Setting native context menu with JSON: %s\n", menu_json);
    
    // Clear existing menu data
    if (contextMenuJson) {
        free(contextMenuJson);
        contextMenuJson = NULL;
    }
    
    // Store JSON for later use (similar to macOS approach)
    contextMenuJson = strdup(menu_json);
    
    // Parse menu items to validate JSON
    MenuItemData items[32]; // Support up to 32 menu items
    int itemCount = parseMenuItems(menu_json, items, 32);
    
    if (itemCount > 0) {
        // Find WebKit webview instances and connect right-click handlers (similar to macOS method swizzling)
        if (GTK_IS_WINDOW(win)) {
            GtkWidget *contentArea = gtk_bin_get_child(GTK_BIN(win));
            if (contentArea && GTK_IS_CONTAINER(contentArea)) {
                GList *webviews = NULL;
                findWebKitWebViewsInContainer(GTK_CONTAINER(contentArea), &webviews);
                
                for (GList *l = webviews; l != NULL; l = l->next) {
                    GtkWidget *webview = GTK_WIDGET(l->data);
                    
                    // Connect button press event for right-click handling
                    g_signal_connect(webview, "button-press-event", G_CALLBACK(webview_button_press_event), NULL);
                    
                    fprintf(stderr, "Native context menu handler connected to WebKit webview\n");
                }
                
                g_list_free(webviews);
            }
        }
        
        fprintf(stderr, "Native context menu items set for window with %d items\n", itemCount);
    }
}

void platform_window_clear_context_menu(void *native_window) {
    GtkWidget *win = GTK_WIDGET(native_window);
    if (!win) {
        fprintf(stderr, "platform_window_clear_context_menu: Invalid window parameter\n");
        return;
    }
    
    // Clear stored JSON data
    if (contextMenuJson) {
        free(contextMenuJson);
        contextMenuJson = NULL;
    }
    
    // Disconnect event handlers from WebKit webviews
    if (GTK_IS_WINDOW(win)) {
        GtkWidget *contentArea = gtk_bin_get_child(GTK_BIN(win));
        if (contentArea && GTK_IS_CONTAINER(contentArea)) {
            GList *webviews = NULL;
            findWebKitWebViewsInContainer(GTK_CONTAINER(contentArea), &webviews);
            
            for (GList *l = webviews; l != NULL; l = l->next) {
                GtkWidget *webview = GTK_WIDGET(l->data);
                
                // Disconnect the button press event handler
                g_signal_handlers_disconnect_by_func(webview, G_CALLBACK(webview_button_press_event), NULL);
                
                fprintf(stderr, "Native context menu handler disconnected from WebKit webview\n");
            }
            
            g_list_free(webviews);
        }
    }
    
    fprintf(stderr, "platform_window_clear_context_menu: Native context menu cleared for window\n");
}

#endif // __linux__