#ifdef __linux__
#include <gtk/gtk.h>
#include <libnotify/notify.h>
#include "platform_tray.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef struct menu_item_data {
    char id[256];
    platform_menu_click_callback_t callback;
    void* userdata;
} menu_item_data_t;

struct platform_tray {
    GtkStatusIcon* status_icon;
    GtkWidget* menu;
    platform_tray_click_callback_t click_callback;
    platform_menu_click_callback_t menu_callback;
    void* userdata;
    GSList* menu_item_data_list;
};

static void on_tray_icon_activate(GtkStatusIcon* status_icon, gpointer user_data) {
    // Left-click now shows the menu instead of calling custom handlers
    platform_tray_t* tray = (platform_tray_t*)user_data;
    if (tray && tray->menu) {
        gtk_menu_popup(GTK_MENU(tray->menu), NULL, NULL, gtk_status_icon_position_menu, 
                      status_icon, 0, gtk_get_current_event_time());
    }
}

static void on_tray_icon_popup_menu(GtkStatusIcon* status_icon, guint button, guint activate_time, gpointer user_data) {
    platform_tray_t* tray = (platform_tray_t*)user_data;
    if (tray && tray->menu) {
        gtk_menu_popup(GTK_MENU(tray->menu), NULL, NULL, gtk_status_icon_position_menu, 
                      status_icon, button, activate_time);
    }
}

static void on_menu_item_activate(GtkMenuItem* menu_item, gpointer user_data) {
    menu_item_data_t* data = (menu_item_data_t*)user_data;
    if (data && data->callback) {
        data->callback(data->id, data->userdata);
    }
}

platform_tray_t* platform_tray_create(const char* icon_path, const char* tooltip) {
    if (!gtk_init_check(0, NULL)) {
        fprintf(stderr, "Failed to initialize GTK\n");
        return NULL;
    }
    
    // Initialize libnotify for notifications
    if (!notify_init("Tronbun")) {
        fprintf(stderr, "Failed to initialize libnotify\n");
    }
    
    platform_tray_t* tray = (platform_tray_t*)calloc(1, sizeof(platform_tray_t));
    if (!tray) return NULL;
    
    // Create status icon
    if (icon_path) {
        tray->status_icon = gtk_status_icon_new_from_file(icon_path);
    } else {
        tray->status_icon = gtk_status_icon_new_from_icon_name("application-default-icon");
    }
    
    if (!tray->status_icon) {
        free(tray);
        return NULL;
    }
    
    // Set tooltip
    if (tooltip) {
        gtk_status_icon_set_tooltip_text(tray->status_icon, tooltip);
    }
    
    // Set up click handlers
    g_signal_connect(G_OBJECT(tray->status_icon), "activate", 
                    G_CALLBACK(on_tray_icon_activate), tray);
    g_signal_connect(G_OBJECT(tray->status_icon), "popup-menu", 
                    G_CALLBACK(on_tray_icon_popup_menu), tray);
    
    // Make the icon visible
    gtk_status_icon_set_visible(tray->status_icon, TRUE);
    
    return tray;
}

void platform_tray_destroy(platform_tray_t* tray) {
    if (!tray) return;
    
    // Destroy menu and free menu item data
    if (tray->menu) {
        gtk_widget_destroy(tray->menu);
    }
    
    GSList* item = tray->menu_item_data_list;
    while (item) {
        free(item->data);
        item = item->next;
    }
    g_slist_free(tray->menu_item_data_list);
    
    // Destroy status icon
    if (tray->status_icon) {
        g_object_unref(tray->status_icon);
    }
    
    notify_uninit();
    free(tray);
}

int platform_tray_set_icon(platform_tray_t* tray, const char* icon_path) {
    if (!tray || !icon_path) return -1;
    
    gtk_status_icon_set_from_file(tray->status_icon, icon_path);
    return 0;
}

int platform_tray_set_tooltip(platform_tray_t* tray, const char* tooltip) {
    if (!tray || !tooltip) return -1;
    
    gtk_status_icon_set_tooltip_text(tray->status_icon, tooltip);
    return 0;
}

int platform_tray_set_menu(platform_tray_t* tray, const platform_menu_item_t* menu_items, int count) {
    if (!tray || !menu_items || count <= 0) return -1;
    
    // Destroy existing menu and data
    if (tray->menu) {
        gtk_widget_destroy(tray->menu);
    }
    
    GSList* item = tray->menu_item_data_list;
    while (item) {
        free(item->data);
        item = item->next;
    }
    g_slist_free(tray->menu_item_data_list);
    tray->menu_item_data_list = NULL;
    
    // Create new menu
    tray->menu = gtk_menu_new();
    
    for (int i = 0; i < count; i++) {
        const platform_menu_item_t* menu_item = &menu_items[i];
        GtkWidget* gtk_menu_item;
        
        if (menu_item->type == 1) { // separator
            gtk_menu_item = gtk_separator_menu_item_new();
        } else if (menu_item->type == 2) { // checkbox
            gtk_menu_item = gtk_check_menu_item_new_with_label(menu_item->label);
            gtk_check_menu_item_set_active(GTK_CHECK_MENU_ITEM(gtk_menu_item), menu_item->checked);
        } else { // normal item
            gtk_menu_item = gtk_menu_item_new_with_label(menu_item->label);
        }
        
        gtk_widget_set_sensitive(gtk_menu_item, menu_item->enabled);
        
        if (menu_item->type != 1) { // not separator
            // Create menu item data
            menu_item_data_t* data = (menu_item_data_t*)malloc(sizeof(menu_item_data_t));
            strncpy(data->id, menu_item->id, sizeof(data->id) - 1);
            data->id[sizeof(data->id) - 1] = '\0';
            data->callback = tray->menu_callback;
            data->userdata = tray->userdata;
            
            tray->menu_item_data_list = g_slist_append(tray->menu_item_data_list, data);
            
            g_signal_connect(G_OBJECT(gtk_menu_item), "activate", 
                           G_CALLBACK(on_menu_item_activate), data);
        }
        
        gtk_menu_shell_append(GTK_MENU_SHELL(tray->menu), gtk_menu_item);
        gtk_widget_show(gtk_menu_item);
    }
    
    return 0;
}

void platform_tray_set_click_callback(platform_tray_t* tray, platform_tray_click_callback_t callback, void* userdata) {
    if (!tray) return;
    
    tray->click_callback = callback;
    tray->userdata = userdata;
}

void platform_tray_set_menu_callback(platform_tray_t* tray, platform_menu_click_callback_t callback, void* userdata) {
    if (!tray) return;
    
    tray->menu_callback = callback;
    tray->userdata = userdata;
    
    // Update existing menu item callbacks
    GSList* item = tray->menu_item_data_list;
    while (item) {
        menu_item_data_t* data = (menu_item_data_t*)item->data;
        data->callback = callback;
        data->userdata = userdata;
        item = item->next;
    }
}

int platform_tray_show_notification(platform_tray_t* tray, const char* title, const char* body) {
    if (!tray || !title || !body) return -1;
    
    NotifyNotification* notification = notify_notification_new(title, body, NULL);
    if (!notification) return -1;
    
    GError* error = NULL;
    gboolean result = notify_notification_show(notification, &error);
    
    if (error) {
        fprintf(stderr, "Notification error: %s\n", error->message);
        g_error_free(error);
        result = FALSE;
    }
    
    g_object_unref(notification);
    return result ? 0 : -1;
}

void platform_tray_run_event_loop(void* context) {
    // Import the IPC context structure
    typedef struct {
        int should_exit;
        void* application_data;
    } ipc_base_context_t;
    
    ipc_base_context_t* ipc_context = (ipc_base_context_t*)context;
    
    // GTK main loop for Linux
    while (!ipc_context->should_exit) {
        gtk_main_iteration_do(FALSE);
        usleep(10000); // 10ms
    }
}

int platform_tray_is_supported(void) {
    // Check if we're running in a desktop environment that supports tray icons
    return (getenv("DISPLAY") != NULL || getenv("WAYLAND_DISPLAY") != NULL) ? 1 : 0;
}

#endif // __linux__
