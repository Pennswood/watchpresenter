/*
 * Copyright 2014 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package com.zuluindia.watchpresenter;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.media.MediaPlayer;
import android.net.wifi.WifiManager;
import android.os.IBinder;
import android.os.PowerManager;
import android.support.v4.app.NotificationManagerCompat;
import android.util.Log;

import java.util.Timer;
import java.util.TimerTask;

/**
 * This service's purpose is to play an inaudible audio in the background.
 *
 * That way, we can detect volume key's presses with a Receiver.
 */
public class MonitorVolumeKeyPress extends Service{
    private static final String LOGCAT = null;
    MediaPlayer objPlayer;
    WifiManager.WifiLock wifiLock = null;
    private static final String ACTION_VOLUME_KEY_PRESS = "android.media.VOLUME_CHANGED_ACTION";
    private static final long SWITCH_OFF_DELAY = 3600000;


    private Timer timer;

    private BroadcastReceiver volumeKeysReceiver = new BroadcastReceiver() {

        private static final long DUPLICATE_TIME = 200;


        private long lastEvent = 0;
        private int lastVolume = -1; //By initializing to a negative value we
        //are assuming that the first event ever is a next slide event

        @Override
        public void onReceive(Context context, Intent intent) {
            Intent i = new Intent("com.zuluindia.watchpresenter.SEND_MESSAGE");
            final long currentEvent = System.currentTimeMillis();
            if(currentEvent - lastEvent > DUPLICATE_TIME) {
                int newVolume =
                        (Integer)intent.getExtras().get("android.media.EXTRA_VOLUME_STREAM_VALUE");
                final String message = (newVolume!=0&&(newVolume >= lastVolume))?
                        Constants.NEXT_SLIDE_MESSAGE: Constants.PREV_SLIDE_MESSAGE;
                lastVolume = newVolume;
                i.putExtra(Constants.EXTRA_MESSAGE, message);
                context.sendBroadcast(i);
                scheduleShutdown();
            }
            else{
                Log.d(Constants.LOG_TAG, "Duplicate volume event discarded");
            }
            lastEvent = currentEvent;
        }
    };


    public void onCreate(){
        super.onCreate();
        Log.d(LOGCAT, "Service Started!");
        objPlayer = MediaPlayer.create(this, com.zuluindia.watchpresenter.R.raw.silence);
        objPlayer.setWakeMode(getApplicationContext(), PowerManager.PARTIAL_WAKE_LOCK);
        objPlayer.setLooping(true);
        timer = new Timer();
    }

    public int onStartCommand(Intent intent, int flags, int startId) {
        startMonitoring();
        return 1;
    }

    @Override
    public void onDestroy(){
        Log.d(Constants.LOG_TAG, "destroying KeyPress monitor service");
        stopMonitoring();
    }
    @Override
    public IBinder onBind(Intent objIndent) {
        return null;
    }

    private void startMonitoring(){
        wifiLock = ((WifiManager) getSystemService(Context.WIFI_SERVICE))
                .createWifiLock(WifiManager.WIFI_MODE_FULL, "WatchPresenterLock");
        wifiLock.acquire();
        objPlayer.start();
        registerReceiver(volumeKeysReceiver, new IntentFilter(ACTION_VOLUME_KEY_PRESS));
        Log.d(LOGCAT, "Media Player started!");
        if(objPlayer.isLooping() != true){
            Log.d(LOGCAT, "Problem in Playing Audio");
        }
        scheduleShutdown();
    }

    private void stopMonitoring(){
        objPlayer.stop();
        wifiLock.release();
        objPlayer.release();
        cancelShutdown();
        unregisterReceiver(volumeKeysReceiver);
    }

    private synchronized void scheduleShutdown(){
        if(timer != null){
            timer.cancel();
        }
        timer = new Timer();
        timer.schedule(new TimerTask(){

            @Override
            public void run() {
                if(MainActivity.active == false) {
                    Log.d(Constants.LOG_TAG, "Timeout, stopping keypress monitoring service...");
                    NotificationManagerCompat notificationManager =
                            NotificationManagerCompat.from(MonitorVolumeKeyPress.this);

// Build the notification and issues it with notification manager.
                    notificationManager.cancel(MainActivity.PRESENTING_NOTIFICATION_ID);
                    stopSelf();
                }
                else{
                    Log.d(Constants.LOG_TAG, "Timeout, but MainActivity in foreground. Not stopping");
                }
            }
        }, SWITCH_OFF_DELAY);
    }

    private synchronized void cancelShutdown(){
        if(timer != null){
            timer.cancel();
        }
    }

}