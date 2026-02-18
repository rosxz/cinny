package app.cinny.mobile;

import android.app.Application;
import androidx.lifecycle.DefaultLifecycleObserver;
import androidx.lifecycle.LifecycleOwner;
import androidx.lifecycle.ProcessLifecycleOwner;

public class MainApplication extends Application implements DefaultLifecycleObserver {

    private static boolean isForeground = false;

    @Override
    public void onCreate() {
        super.onCreate();
        ProcessLifecycleOwner.get().getLifecycle().addObserver(this);
    }

    @Override
    public void onStart(LifecycleOwner owner) {
        isForeground = true;
    }

    @Override
    public void onStop(LifecycleOwner owner) {
        isForeground = false;
    }

    public static boolean isAppInForeground() {
        return isForeground;
    }
}