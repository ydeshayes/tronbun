#ifdef __linux__
#include <gtk/gtk.h>
#include <gdk/gdk.h>
#include "platform_window.h"

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

#endif // __linux__