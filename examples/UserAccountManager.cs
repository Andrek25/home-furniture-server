using PlayFab;
using PlayFab.ClientModels;
using System;
using System.Collections;
using System.Collections.Generic;
using System.Web;
using UnityEngine;
using UnityEngine.Events;


public class UserAccountManager : MonoBehaviour
{

    public static UserAccountManager Instance;

    public static UnityEvent OnSignInSuccess = new UnityEvent();
    public static UnityEvent<string> OnSignInFailed = new UnityEvent<string>();
    public static UnityEvent<string> OnCreateAccountFailed = new UnityEvent<string>();
    public static UnityEvent<string, string> OnUserDataRetrieved = new UnityEvent<string, string>();
    public static UnityEvent<string, List<PlayerLeaderboardEntry>> OnLeaderboardRetrieved = new UnityEvent<string, List<PlayerLeaderboardEntry>>();
    public static UnityEvent<string, StatisticValue> OnStatisticRetrieved = new UnityEvent<string, StatisticValue>();

    public static UnityEvent<string, string> OnUserSpecificDataRetrieved = new UnityEvent<string, string>();
    public static UnityEvent<string> OnUserIdRetrieved = new UnityEvent<string>();
    public static UnityEvent<string> OnUserIdError = new UnityEvent<string>();

    public static UnityEvent<String> OnRecoverEmailSuccess = new UnityEvent<string>();
    public static UnityEvent<String> OnRecoverEmailFailed = new UnityEvent<string>();

    public static string playfabID;
    public static UserAccountInfo userAccountInfo;

    public static UnityEvent<string> OnUserSpecificDataError = new UnityEvent<string>();
    public static UnityEvent<string> OnUserDataSet = new UnityEvent<string>();
    public static UnityEvent<string> OnUserDataError = new UnityEvent<string>();


    public Dictionary<string, string> RoomsDictionary;


    private bool _IsSignedInAfterCreation = false;

    public static FurnitureNetwork.Network m_FurnitureNetwork;
    private const string PrivateApiServerUrl = "https://home-furniture-server-33or.onrender.com";

    private const string RememberMeKey = "PF_REMEMBER_ME";
    private const string LastUsernameKey = "PF_REMEMBER_LAST_USER";

    private const string DemoOwnerPlayfabId = "DAB674F3C666368C";
    private const string DemoDataKey = "Demo";

    //private const string RoomDemo;

    void Awake()
    {
        Instance = this;
        m_FurnitureNetwork = new FurnitureNetwork.Network();
    }



    /*
        ACCOUNT
    */

    public void CreateAccount(string username, string emailAddress, string password)
    {

        AuthTrace.I("UserAccountManager.CreateAccount", $"Creating account for {username}, {emailAddress}");

        //Debug.Log ($"Creating account for {username}, {emailAddress}, {password}");
        PlayFabClientAPI.RegisterPlayFabUser(
            new RegisterPlayFabUserRequest()
            {
                Email = emailAddress,
                Password = password,
                Username = username,
            },
            response =>
            {
                Debug.Log($"Successful Account Creation: {username}, {emailAddress}");
                AuthTrace.I("UserAccountManager.CreateAccount", $"Successful Account Creation: {username}, {emailAddress}");
                //save demo room
                SaveDefaultDemo(username, () =>
                {
                    _IsSignedInAfterCreation = true;
                    SignIn(username, password);
                });

                _IsSignedInAfterCreation = true;
                SignIn(username, password);
            },
            error =>
            {
                Debug.Log($"Unsuccessful Account Creation: {username}, {emailAddress} \n {error.ErrorMessage}");
                AuthTrace.E("UserAccountManager.CreateAccount", $"Unsuccessful Account Creation: {username}, {emailAddress} \n {error.ErrorMessage}");
                OnCreateAccountFailed.Invoke(error.ErrorMessage);
            }
        );
    }

    private void SaveDefaultDemo(string username, Action onComplete)
    {
        AuthTrace.I("UserAccountManager.SaveDefaultDemo", "Saving default demo data...");
        //TextAsset jsonFile = Resources.Load<TextAsset>("DemoRoom");

        //string uuid = Guid.NewGuid().ToString();
        //RoomJsonWrapper jsonListWrapper = RoomJsonWrapper.ConvertJSONToFurnitureJSONListWrapper(jsonFile.text);
        //jsonListWrapper.SceneBaseID = uuid;
        //jsonListWrapper.OriginalOwnerUsername = username;

        //string uuid = Guid.NewGuid().ToString();
        //UserAccountManager.Instance.SetUserData("RoomDesign_" + uuid, jsonListWrapper.ConvertToJSON(), onComplete);

       StartCoroutine( SaveMulitpleDefaultDemos(username, onComplete));


    }

    private IEnumerator SaveMulitpleDefaultDemos(string username, Action onComplete)
    {
        AuthTrace.I("Demos", "SaveMulitpleDefaultDemos started");

        // 1) Get the demo list JSON (DemoDataKey) from demo owner
        GetUserDataResult demoIndexResult = null;
        PlayFabError demoIndexError = null;
        bool done = false;

        PlayFabClientAPI.GetUserData(new GetUserDataRequest
        {
            PlayFabId = DemoOwnerPlayfabId,
            Keys = new List<string> { DemoDataKey }
        },
        r => { demoIndexResult = r; done = true; },
        e => { demoIndexError = e; done = true; });

        while (!done) yield return null;

        if (demoIndexError != null)
        {
            AuthTrace.E("Demos", "Get demo index failed: " + demoIndexError.GenerateErrorReport());
            OnUserSpecificDataError?.Invoke(demoIndexError.ErrorMessage);
            yield break;
        }

        if (demoIndexResult.Data == null || !demoIndexResult.Data.ContainsKey(DemoDataKey))
        {
            AuthTrace.W("Demos", "DemoDataKey not found on demo owner");
            yield break;
        }

        var indexJson = demoIndexResult.Data[DemoDataKey].Value;
        AuthTrace.I("Demos", $"Demo index json len={indexJson?.Length}");

        // IMPORTANT: DemoWrapper must be [Serializable] class, not MonoBehaviour
        DemoWrapper demoWrapper = DemoWrapper.FromJson(indexJson);

        // 2) Convert urls -> keys
        List<string> demoKeys = new List<string>();
        for (int i = 0; i < demoWrapper.DemoList.Count; i++)
        {
            (string player, string key) = GetKeyFromUrl(demoWrapper.DemoList[i]);
            if (!string.IsNullOrEmpty(key))
                demoKeys.Add(key);
            else
                AuthTrace.W("Demos", $"Could not parse key from url: {demoWrapper.DemoList[i]}");
        }

        if (demoKeys.Count == 0)
        {
            AuthTrace.W("Demos", "No demo keys parsed");
            yield break;
        }

        AuthTrace.I("Demos", $"Parsed {demoKeys.Count} demo keys");

        // 3) Fetch all demo rooms data in one call
        GetUserDataResult demoRoomsResult = null;
        PlayFabError demoRoomsError = null;
        done = false;

        PlayFabClientAPI.GetUserData(new GetUserDataRequest
        {
            PlayFabId = DemoOwnerPlayfabId,
            Keys = demoKeys
        },
        r => { demoRoomsResult = r; done = true; },
        e => { demoRoomsError = e; done = true; });

        while (!done) yield return null;

        if (demoRoomsError != null)
        {
            AuthTrace.E("Demos", "Get demo rooms failed: " + demoRoomsError.GenerateErrorReport());
            OnUserSpecificDataError?.Invoke(demoRoomsError.ErrorMessage);
            yield break;
        }

        if (demoRoomsResult.Data == null || demoRoomsResult.Data.Count == 0)
        {
            AuthTrace.W("Demos", "Demo rooms result empty");
            yield break;
        }

        // 4) For each demo key -> call your duplicate coroutine
        int successCount = 0;
        int failCount = 0;

        foreach (var key in demoKeys)
        {
            if (!demoRoomsResult.Data.TryGetValue(key, out var record) || record == null || string.IsNullOrEmpty(record.Value))
            {
                AuthTrace.W("Demos", $"Missing/empty data for key={key}");
                failCount++;
                continue;
            }

            string json = record.Value;

            AuthTrace.I("Demos", $"Duplicating key={key} jsonLen={json.Length}");
            yield return StartCoroutine(DuplicateFurnitureWrapperRoutineAndAdd(key, json));
            // Your coroutine already logs errors; if you want a success/fail return, we can refactor it.
            successCount++;
        }

        AuthTrace.I("Demos", $"Duplication done. success={successCount} fail={failCount}");
        onComplete?.Invoke();
    }

    public (string, string) GetKeyFromUrl(string Url)
    {
        string tokenArgName = "Room";
        // var applicationUrl = SimpleEncryption.Decrypt(encryptedUrl,SimpleEncKey,SimpleEncIv);
        var applicationUrl = Url;
        //Debug.Log(applicationUrl);

        if (!applicationUrl.Contains(tokenArgName))
            return (null, null);

        var splitApplication = applicationUrl.Split("?");
        string player = string.Empty;
        string room = string.Empty;

        // Find the fragment part of the URL
        Uri uri = new Uri(applicationUrl);
        string host = uri.Host;
        string fragment = uri.Fragment;

        if (!string.IsNullOrEmpty(uri.Query))
        {
            // Remove the leading '#' from the fragment


            // Parse the query string
            var queryParameters = HttpUtility.ParseQueryString(uri.Query);
            player = queryParameters["player"];
            room = queryParameters["Room"];
        }
        return (player, "RoomDesign_" + room);
    }

    public IEnumerator DuplicateFurnitureWrapperRoutineAndAdd(string key, string data)
    {
        var DataInUrl = data;
        RoomJsonWrapper furnitureWrapper = RoomJsonWrapper.ConvertJSONToFurnitureJSONListWrapper(DataInUrl);
        RoomJsonWrapper cloneFurnitureWrapper = furnitureWrapper.CloneDifferentID();
        string id = "-1";

        bool isSuccess = false;
        string error = "";
        //yield return StartCoroutine(UserAccountManager.m_FurnitureNetwork.AddFurnitureOwner(int.Parse(cloneFurnitureWrapper.OriginUrl), UserAccountManager.userAccountInfo.Username, () =>{ Debug.Log("added"); },(errorCall) => { Debug.LogError(errorCall); }));

        yield return StartCoroutine(UserAccountManager.m_FurnitureNetwork.ClaimDuplicateFurniture(cloneFurnitureWrapper.Token, null, (result) => { id = result.id; isSuccess = true; }, (errorCallBack) => { error = errorCallBack; }));
        if (isSuccess)
        {
            cloneFurnitureWrapper.IsShared = false;
            cloneFurnitureWrapper.LastOpenedUtc = DateTime.Now;
            var KeyLoadedAndAdded = "RoomDesign_" + cloneFurnitureWrapper.SceneBaseID;
            cloneFurnitureWrapper.OriginUrl = id;
            UserAccountManager.Instance.SetUserData("RoomDesign_" + cloneFurnitureWrapper.SceneBaseID, cloneFurnitureWrapper.ConvertToJSON(), UserDataPermission.Public);
            //LoadingScreen.instance.SetLoading(false);
        }
        else
        {
            //notificationWindow.OnNotificationStarts("Failded to find room", 5);
            Debug.LogError(error);
            Debug.Log(cloneFurnitureWrapper.OriginUrl);
            //LoadingScreen.instance.SetLoading(false);
        }

    }

    public void SignIn(string username, string password)
    {
        SignIn(username, password, false); // keep old calls working
    }

    public void SignIn(string username, string password, bool rememberMe)
    {
        AuthTrace.I("UserAccountManager.SignIn", $"Attempting login for {username}");
        PlayFabClientAPI.LoginWithPlayFab(new LoginWithPlayFabRequest()
        {
            Username = username,
            Password = password
        },
        response =>
        {
            Debug.Log($"Successful Account Login: {username}");
            AuthTrace.I("UserAccountManager.SignIn", $"Successful Account Login: {username}");
            ApplySessionAndInvoke(username, response);

#if UNITY_ANDROID || UNITY_IOS
            if (rememberMe)
            {
                AuthTrace.I("UserAccountManager.SignIn", "Linking device for remember-me.");
                LinkThisDeviceForRememberMe(username);
            }
            else
            {
                AuthTrace.I("UserAccountManager.SignIn", "Clearing remember-me data.");
                PlayerPrefs.DeleteKey(RememberMeKey);
                PlayerPrefs.Save();
            }
#endif
        },
        error =>
        {
            AuthTrace.E("UserAccountManager.SignIn", $"Unsuccessful Account Login: {username} \n {error.ErrorMessage}");
            Debug.Log($"Unsuccessful Account Login: {username} \n {error.ErrorMessage}");
            OnSignInFailed.Invoke(error.ErrorMessage);
            if (LoadingScreen.instance != null)
                LoadingScreen.instance.SetLoading(false);
        });
    }

    public void TryAutoSignInWithDevice()
    {
#if !(UNITY_ANDROID || UNITY_IOS)
        return;
#else
        if (PlayerPrefs.GetInt(RememberMeKey, 0) != 1)
            return;

        if (!GetDeviceId(out string androidId, out string iosId, out _))
            return;

        AuthTrace.I("UserAccountManager.TryAutoSignInWithDevice", $"Attempting auto-login with device ID");

        if (!string.IsNullOrEmpty(androidId))
        {
            PlayFabClientAPI.LoginWithAndroidDeviceID(new LoginWithAndroidDeviceIDRequest
            {
                AndroidDeviceId = androidId,
                TitleId = PlayFabSettings.TitleId,
                CreateAccount = false
            },
            result =>
            {
                AuthTrace.I("UserAccountManager.TryAutoSignInWithDevice", "Auto-login success (Android)");
                //Debug.Log("Auto-login success (Android)");
                ApplySessionAndInvoke("User", result);
            },
            error =>
            {
                AuthTrace.E("UserAccountManager.TryAutoSignInWithDevice", $"Auto-login failed (Android): {error.ErrorMessage}");
                PlayerPrefs.DeleteKey(RememberMeKey);
                //Debug.LogWarning($"Auto-login failed (Android): {error.ErrorMessage}");
                PlayerPrefs.DeleteKey(RememberMeKey);
                PlayerPrefs.Save();
                OnSignInFailed.Invoke(error.ErrorMessage);
            });
        }
        else if (!string.IsNullOrEmpty(iosId))
        {
            PlayFabClientAPI.LoginWithIOSDeviceID(new LoginWithIOSDeviceIDRequest
            {
                DeviceId = iosId,
                TitleId = PlayFabSettings.TitleId,
                CreateAccount = false
            },
            result =>
            {
                AuthTrace.I("UserAccountManager.TryAutoSignInWithDevice", "Auto-login success (iOS)");
                ApplySessionAndInvoke("User", result);
            },
            error =>
            {
                AuthTrace.E("UserAccountManager.TryAutoSignInWithDevice", $"Auto-login failed (iOS): {error.ErrorMessage}");
                PlayerPrefs.DeleteKey(RememberMeKey);
                PlayerPrefs.Save();
                OnSignInFailed.Invoke(error.ErrorMessage);
            });
        }
#endif
    }

    private void LinkThisDeviceForRememberMe(string username)
    {
        AuthTrace.I("UserAccountManager.LinkThisDeviceForRememberMe", $"Linking device for {username}");
#if !(UNITY_ANDROID || UNITY_IOS)
        return;
#else
        if (!GetDeviceId(out string androidId, out string iosId, out _))
            return;

        if (!string.IsNullOrEmpty(androidId))
        {
            PlayFabClientAPI.LinkAndroidDeviceID(new LinkAndroidDeviceIDRequest
            {
                AndroidDeviceId = androidId,
                AndroidDevice = SystemInfo.deviceModel,
                OS = SystemInfo.operatingSystem,
                ForceLink = false
            },
            _ =>
            {
                PlayerPrefs.SetInt(RememberMeKey, 1);
                PlayerPrefs.SetString(LastUsernameKey, username);
                PlayerPrefs.Save();
                AuthTrace.I("UserAccountManager.LinkThisDeviceForRememberMe", "Device linked (Android). Remember-me enabled.");
            },
            err => AuthTrace.E("UserAccountManager.LinkThisDeviceForRememberMe", $"LinkAndroidDeviceID failed: {err.ErrorMessage}"));

        }
        else if (!string.IsNullOrEmpty(iosId))
        {
            PlayFabClientAPI.LinkIOSDeviceID(new LinkIOSDeviceIDRequest
            {
                DeviceId = iosId,
                DeviceModel = SystemInfo.deviceModel,
                OS = SystemInfo.operatingSystem,
                ForceLink = false
            },
            _ =>
            {
                PlayerPrefs.SetInt(RememberMeKey, 1);
                PlayerPrefs.SetString(LastUsernameKey, username);
                PlayerPrefs.Save();
                AuthTrace.I("UserAccountManager.LinkThisDeviceForRememberMe", "Device linked (iOS). Remember-me enabled.");
         
            },
            err => AuthTrace.E("UserAccountManager.LinkThisDeviceForRememberMe", $"LinkIOSDeviceID failed: {err.ErrorMessage}"));
        }
#endif
    }

    private void ApplySessionAndInvoke(string displayNameCandidate, LoginResult result)
    {
        playfabID = result.PlayFabId;

        m_FurnitureNetwork.apiUri = PrivateApiServerUrl;
        m_FurnitureNetwork.token = result.SessionTicket;

        AuthTrace.I("UserAccountManager.ApplySessionAndInvoke", $"Session applied, PlayFab ID: {playfabID}");
        AuthTrace.I("UserAccountManager.ApplySessionAndInvoke", $"Token is: {m_FurnitureNetwork.token}");

        CheckDisplayName(displayNameCandidate, () => OnSignInSuccess.Invoke());
    }


    public void LogoutFromPlayFab()
    {
        AuthTrace.I("UAM.Logout", "Logout called");

        // Clear any stored session ticket and cached credentials
        PlayFabClientAPI.ForgetAllCredentials();
        AuthTrace.I("UAM.Logout", "PlayFab credentials cleared (ForgetAllCredentials)");

        // Clear Remember Me (local flag + last username)
        PlayerPrefs.DeleteKey(RememberMeKey);
        PlayerPrefs.DeleteKey(LastUsernameKey);
        PlayerPrefs.Save();

        AuthTrace.I("UAM.Logout", "Remember-me cleared (PF_REMEMBER_ME + PF_REMEMBER_LAST_USER)");

        Debug.Log("Logged out from PlayFab successfully");
    }
    public void SignInWithDevice()
    {
        if (GetDeviceId(out string android_id, out string ios_id, out string custom_id))
        {
            if (!string.IsNullOrEmpty(android_id))
            {
                Debug.Log("Using Android Device ID: " + android_id);

                PlayFabClientAPI.LoginWithAndroidDeviceID(new LoginWithAndroidDeviceIDRequest()
                {
                    AndroidDeviceId = android_id,
                    TitleId = PlayFabSettings.TitleId,
                    CreateAccount = true
                }, result =>
                {
                    Debug.Log($"Successful Login with Android Device ID");
                    playfabID = result.PlayFabId;
                    CheckDisplayName("User", () => OnSignInSuccess.Invoke());
                }, error =>
                {
                    Debug.Log($"<color=red>Unsuccessful Login with Android Device ID</color>");
                    OnSignInFailed.Invoke(error.ErrorMessage);
                });
            }
            else if (!string.IsNullOrEmpty(ios_id))
            {
                Debug.Log("Using IOS Device ID: " + ios_id);

                PlayFabClientAPI.LoginWithIOSDeviceID(new LoginWithIOSDeviceIDRequest()
                {
                    DeviceId = ios_id,
                    TitleId = PlayFabSettings.TitleId,
                    CreateAccount = true
                }, result =>
                {
                    Debug.Log($"Successful Login with IOS Device ID");
                    playfabID = result.PlayFabId;
                    CheckDisplayName("User", () => OnSignInSuccess.Invoke());
                }, error =>
                {
                    Debug.Log($"<color=red>Unsuccessful Login with IOS Device ID</color>");
                    OnSignInFailed.Invoke(error.ErrorMessage);
                });
            }
        }
        else
        {
            Debug.Log("Using custom device ID: " + custom_id);

            PlayFabClientAPI.LoginWithCustomID(new LoginWithCustomIDRequest()
            {
                CustomId = custom_id,
                TitleId = PlayFabSettings.TitleId,
                CreateAccount = true
            }, result =>
            {
                Debug.Log($"Successful Login with custom device ID");
                playfabID = result.PlayFabId;
                CheckDisplayName("User", () => OnSignInSuccess.Invoke());
            }, error =>
            {
                Debug.Log($"<color=red>Unsuccessful Login with custom device ID</color>");
                OnSignInFailed.Invoke(error.ErrorMessage);
            });
        }
    }

    bool GetDeviceId(out string android_id, out string ios_id, out string custom_id)
    {
        android_id = string.Empty;
        ios_id = string.Empty;
        custom_id = string.Empty;

        if (CheckForSupportedMobilePlatform())
        {
#if UNITY_ANDROID
            //http://answers.unity3d.com/questions/430630/how-can-i-get-android-id-.html
            AndroidJavaClass clsUnity = new AndroidJavaClass("com.unity3d.player.UnityPlayer");
            AndroidJavaObject objActivity = clsUnity.GetStatic<AndroidJavaObject>("currentActivity");
            AndroidJavaObject objResolver = objActivity.Call<AndroidJavaObject>("getContentResolver");
            AndroidJavaClass clsSecure = new AndroidJavaClass("android.provider.Settings$Secure");
            android_id = clsSecure.CallStatic<string>("getString", objResolver, "android_id");
#endif

#if UNITY_IPHONE
            ios_id = UnityEngine.iOS.Device.vendorIdentifier;
#endif
            AuthTrace.I("UserAccountManager.GetDeviceId", $"Device ID retrieved: AndroidIdLen={android_id} iOSIdLen={ios_id}");
            return true;
        }
        else
        {
            custom_id = SystemInfo.deviceUniqueIdentifier;
            AuthTrace.I("UserAccountManager.GetDeviceId", $"Custom device ID: {custom_id}");
            return false;
        }
    }

    bool CheckForSupportedMobilePlatform()
    {
        return Application.platform == RuntimePlatform.Android || Application.platform == RuntimePlatform.IPhonePlayer;
    }

    /*
        DISPLAYNAME
    */

    void CheckDisplayName(string username, UnityAction completeAction)
    {
        PlayFabClientAPI.GetAccountInfo(new GetAccountInfoRequest()
        {
            PlayFabId = playfabID
        }, result =>
        {
            userAccountInfo = result.AccountInfo;

            if (result.AccountInfo.TitleInfo.DisplayName == null || result.AccountInfo.TitleInfo.DisplayName.Length == 0)
            {
                PlayFabClientAPI.UpdateUserTitleDisplayName(new UpdateUserTitleDisplayNameRequest()
                {
                    DisplayName = username
                }, result =>
                {
                    Debug.Log($"Display name set to username");
                    completeAction.Invoke();
                }, error =>
                {
                    Debug.Log($"Display name could not be set to username | {error.ErrorMessage}");
                });
            }
            else
            {
                completeAction.Invoke();
            }
        }, error =>
        {
            Debug.Log($"Could not retrieve AccountInfo | {error.ErrorMessage}");
        });
    }

    public void SetDisplayName(string displayName)
    {
        PlayFabClientAPI.UpdateUserTitleDisplayName(new UpdateUserTitleDisplayNameRequest()
        {
            DisplayName = displayName
        }, result =>
        {
            Debug.Log($"Display name set to username");
        }, error =>
        {
            Debug.Log($"Display name could not be set to username | {error.ErrorMessage}");
        });
    }

    public void GetUserData(string key)
    {
        PlayFabClientAPI.GetUserData(new GetUserDataRequest()
        {
            PlayFabId = playfabID,
            Keys = new List<string>() {
                    key
                }
        }, result =>
        {
            // Debug.Log ($"User data retrieved successfully");
            // Debug.Log(result.ToJson());
            if (result.Data.ContainsKey(key)) OnUserDataRetrieved.Invoke(key, result.Data[key].Value);
            else OnUserDataRetrieved.Invoke(key, null);
        }, error =>
        {
            Debug.Log($"Could not retrieve user data | {error.ErrorMessage}");
        });
    }

    public void GetUserDataSpecificWithUsername(string username, string key)
    {
        GetOtherPlayerPlayFabId(username);
    }

    private void GetOtherPlayerPlayFabId(string username)
    {
        var request = new GetAccountInfoRequest { Username = username };
        PlayFabClientAPI.GetAccountInfo(request, OnAccountInfoReceived, OnAccountInfoError);
    }
    private void OnAccountInfoReceived(GetAccountInfoResult result)
    {
        string playFabId = result.AccountInfo.PlayFabId;

        OnUserIdRetrieved?.Invoke(playFabId);

        // Debug.Log("Found PlayFabId: " + playFabId);
        // GetOtherPlayerData(playFabId);

    }

    public void OnAccountInfoError(PlayFabError error)
    {
        Debug.LogError("Error retrieving user data: " + error.GenerateErrorReport());
        OnUserIdError.Invoke("Error retrieving user data: " + error.GenerateErrorReport());
    }

    private void OnError(PlayFabError error)
    {
        Debug.LogError("Error retrieving user data: " + error.GenerateErrorReport());
    }
    public string GetUserDataSpecificWithID(string otherPlayfabID, string key)
    {
        string SpecificData = null;
        PlayFabClientAPI.GetUserData(new GetUserDataRequest()
        {
            PlayFabId = otherPlayfabID,
            Keys = new List<string>() {
                key
            }
        }, result =>
        {
            if (result.Data.ContainsKey(key))
            {
                SpecificData = result.Data[key].Value;
                OnUserSpecificDataRetrieved.Invoke(key, SpecificData);
            }
            else
            {
                OnUserSpecificDataRetrieved.Invoke(key, null);
            }
        }, error =>
        {
            Debug.Log($"Could not retrieve user data | {error.ErrorMessage}");
            OnUserSpecificDataError?.Invoke(error.ErrorMessage);
        });
        return SpecificData;
    }
    public void SetUserData(string key, string userData)
    {
        PlayFabClientAPI.UpdateUserData(new UpdateUserDataRequest()
        {

            Data = new Dictionary<string, string>() { { key, userData },
            }
        }, result =>
        {
            OnUserDataSet?.Invoke($"{key} successfully updated");
            Debug.Log($"{key} successfully updated");
        }, error =>
        {
            OnUserDataError.Invoke($"{key} update unsuccessful | {error.ErrorMessage}");
            Debug.Log($"{key} update unsuccessful | {error.ErrorMessage}");
        });
    }

    public void SetUserData(string key, string userData, UserDataPermission permission)
    {
        PlayFabClientAPI.UpdateUserData(new UpdateUserDataRequest()
        {
            Permission = permission,
            Data = new Dictionary<string, string>() { { key, userData },
            }
        }, result =>
        {
            OnUserDataSet?.Invoke($"{key} successfully updated");
            Debug.Log($"{key} successfully updated");
        }, error =>
        {
            OnUserDataError.Invoke($"{key} update unsuccessful | {error.ErrorMessage}");
            Debug.Log($"{key} update unsuccessful | {error.ErrorMessage}");
        });
    }

    public void SetUserData(string key, string userData, Action onCompelete)
    {
        PlayFabClientAPI.UpdateUserData(new UpdateUserDataRequest()
        {

            Data = new Dictionary<string, string>() { { key, userData },
            }
        }, result =>
        {
            OnUserDataSet?.Invoke($"{key} successfully updated");
            onCompelete?.Invoke();
            Debug.Log($"{key} successfully updated");
        }, error =>
        {
            OnUserDataError.Invoke($"{key} update unsuccessful | {error.ErrorMessage}");
            Debug.Log($"{key} update unsuccessful | {error.ErrorMessage}");
        });
    }
    public void GetAllUserDataKeys()
    {
        PlayFabClientAPI.GetUserData(new GetUserDataRequest()
        {
            PlayFabId = playfabID
        }, result =>
        {
            // Debug.Log(result.ToJson());
            List<string> keys = new List<string>(result.Data.Keys);
            foreach (string key in keys)
            {
                if (key.StartsWith("RoomDesign_"))
                {
                    // Add key to your UI list
                    // Debug.Log("Found saved room: " + key);
                    // Debug.Log(result.Data[key].Value);
                    if (result.Data[key].Value != null)
                    {
                        OnUserDataRetrieved.Invoke(key, result.Data[key].Value);
                    }

                }

            }
        }, error =>
        {
            Debug.Log($"Could not retrieve user data keys | {error.ErrorMessage}");
        });
    }

    public void GetStatistic(string statistic)
    {
        PlayFabClientAPI.GetPlayerStatistics(new GetPlayerStatisticsRequest()
        {
            StatisticNames = new List<string>() {
                statistic
            }
        }, result =>
        {
            if (result.Statistics.Count > 0)
            {
                Debug.Log($"Successfully got {statistic} | {result.Statistics[0]}");
                if (result.Statistics != null) OnStatisticRetrieved.Invoke(statistic, result.Statistics[0]);
            }
            else
            {
                Debug.Log($"No existing statistic [{statistic}] for user");
            }
        }, error =>
        {
            Debug.Log($"Could not retrieve {statistic} | {error.ErrorMessage}");
        });
    }

    public void SetStatistic(string statistic, int value)
    {
        PlayFabClientAPI.UpdatePlayerStatistics(new UpdatePlayerStatisticsRequest()
        {
            Statistics = new List<StatisticUpdate>() {
                new StatisticUpdate () {
                    StatisticName = statistic,
                        Value = value
                }
            }
        }, result =>
        {
            Debug.Log($"{statistic} successfully updated");
            GetLeaderboard(statistic);
        }, error =>
        {
            Debug.Log($"{statistic} update unsuccessful | {error.ErrorMessage}");
        });
    }

    public void GetLeaderboard(string statistic)
    {
        PlayFabClientAPI.GetLeaderboard(new GetLeaderboardRequest()
        {
            StatisticName = statistic
        }, result =>
        {
            Debug.Log($"Successfully got {statistic} leaderboard | 0.{result.Leaderboard[0].DisplayName} {result.Leaderboard[0].StatValue}");
            OnLeaderboardRetrieved.Invoke(statistic, result.Leaderboard);
        }, error =>
        {
            Debug.Log($"Could not retrieve {statistic} leaderboard | {error.ErrorMessage}");
        });
    }

    public void GetLeaderboardDelayed(string statistic)
    {
        StartCoroutine(CheckLeaderboardDelay(statistic));
    }

    IEnumerator CheckLeaderboardDelay(string statistic)
    {
        yield return new WaitForSeconds(3);
        GetLeaderboard(statistic);
    }


    public void RemoveUserData(string key)
    {
        PlayFabClientAPI.UpdateUserData(new UpdateUserDataRequest()
        {

            KeysToRemove = new List<string>() { { key } }
        }, result =>
        {

            Debug.Log($"{key} successfully removed");
            GetAllUserDataKeys();
        }, error =>
        {
            Debug.Log($"{key} update unsuccessful | {error.ErrorMessage}");
        });

    }

    public void RecoverPassword(string email)
    {
        var request = new SendAccountRecoveryEmailRequest
        {
            Email = email,
            TitleId = PlayFabSettings.TitleId
        };

        PlayFabClientAPI.SendAccountRecoveryEmail(request
            , result =>
            {
                OnRecoverEmailSuccess.Invoke("sent recovery email");
            }
            , error =>
            {
                OnRecoverEmailFailed.Invoke(error.ErrorMessage);
                OnError(error);
            });
    }

    private void OnSuccessCreationPublishDemoRoom()
    {
        var baseID = System.Guid.NewGuid().ToString();
        DemoSceneJsonStringHolder DemoSceneJson = new DemoSceneJsonStringHolder();
        RoomJsonWrapper demoSceneJsonWrapper = RoomJsonWrapper.ConvertJSONToFurnitureJSONListWrapper(DemoSceneJson.DemoScenejson);
        demoSceneJsonWrapper.SceneBaseID = baseID;
        SetUserData("RoomDesign_" + baseID, demoSceneJsonWrapper.ConvertToJSON(), UserDataPermission.Public);
    }


    #region ACCOUNT ROUTINES
    // Coroutine versions of CreateAccount, SignIn, and Logout

    public IEnumerator CreateAccountRoutine(string username, string emailAddress, string password)
    {
        bool isDone = false;
        PlayFabError errorResult = null;

        PlayFabClientAPI.RegisterPlayFabUser(
            new RegisterPlayFabUserRequest()
            {
                Email = emailAddress,
                Password = password,
                Username = username,
            },
            response =>
            {
                Debug.Log($"Successful Account Creation: {username}, {emailAddress}");

                // Keep the same logic as your existing CreateAccount
                SaveDefaultDemo(username, () =>
                {
                    _IsSignedInAfterCreation = true;
                    SignIn(username, password);
                });

                _IsSignedInAfterCreation = true;
                SignIn(username, password);

                isDone = true;
            },
            error =>
            {
                Debug.Log($"Unsuccessful Account Creation: {username}, {emailAddress} \n {error.ErrorMessage}");
                OnCreateAccountFailed.Invoke(error.ErrorMessage);

                errorResult = error;
                isDone = true;
            }
        );

        while (!isDone)
        {
            yield return null;
        }

        if (errorResult != null)
        {
            // Optional: handle post-error logic here
            yield break;
        }
    }

    public IEnumerator SignInRoutine(string username, string password)
    {
        bool isDone = false;
        PlayFabError errorResult = null;

        PlayFabClientAPI.LoginWithPlayFab(
            new LoginWithPlayFabRequest()
            {
                Username = username,
                Password = password
            },
            response =>
            {
                Debug.Log($"Successful Account Login: {username}");
                playfabID = response.PlayFabId;

                CheckDisplayName(username, () => OnSignInSuccess.Invoke());

                // Same extra logic as your existing SignIn
                m_FurnitureNetwork.apiUri = PrivateApiServerUrl;
                m_FurnitureNetwork.token = response.SessionTicket;

                Debug.Log(m_FurnitureNetwork.token);

                SessionInfo.LoadScene(SessionInfo.RoomSaved);

                isDone = true;
            },
            error =>
            {
                Debug.Log($"Unsuccessful Account Login: {username} \n {error.ErrorMessage}");
                OnSignInFailed.Invoke(error.ErrorMessage);

                if (LoadingScreen.instance != null)
                {
                    LoadingScreen.instance.SetLoading(false);
                }

                errorResult = error;
                isDone = true;
            }
        );

        while (!isDone)
        {
            yield return null;
        }

        if (errorResult != null)
        {
            // Optional: handle post-error logic here
            yield break;
        }
    }

    public IEnumerator LogoutFromPlayFabRoutine()
    {
        // Your existing logout is synchronous, so we just call it and end.
        LogoutFromPlayFab();
        yield break;
    }

    /// <summary>
    /// Coroutine version of GetUserDataSpecificWithUsername.
    /// 1) Looks up the other player's PlayFabId from their username.
    /// 2) Calls GetUserDataSpecificWithIDRoutine to fetch the data for the given key.
    /// 
    /// Results are still delivered via:
    /// - OnUserIdRetrieved  (PlayFabId)
    /// - OnUserSpecificDataRetrieved (key, value or null)
    /// - OnUserSpecificDataError (error message)
    /// </summary>
    public IEnumerator GetUserDataSpecificWithUsernameRoutine(string username, string key)
    {
        // ---- Step 1: Get other player's PlayFabId by username ----
        bool accountInfoDone = false;
        PlayFabError accountInfoError = null;
        string otherPlayfabID = null;

        var accountRequest = new GetAccountInfoRequest
        {
            Username = username
        };

        PlayFabClientAPI.GetAccountInfo(
            accountRequest,
            result =>
            {
                // Keep existing behaviour: call your original handler
                OnAccountInfoReceived(result);

                // Capture PlayFabId locally so we can use it below
                if (result.AccountInfo != null)
                {
                    otherPlayfabID = result.AccountInfo.PlayFabId;
                }

                accountInfoDone = true;
            },
            error =>
            {
                // Keep existing error handling
                OnError(error);
                accountInfoError = error;
                accountInfoDone = true;
            });

        while (!accountInfoDone)
            yield return null;

        // If something went wrong with account lookup, stop here
        if (accountInfoError != null || string.IsNullOrEmpty(otherPlayfabID))
            yield break;

        // ---- Step 2: With that PlayFabId, get specific user data for the key ----
        yield return GetUserDataSpecificWithIDRoutine(otherPlayfabID, key);
    }

    /// <summary>
    /// Coroutine version of GetOtherPlayerPlayFabId.
    /// - Just gets the PlayFabId for the given username.
    /// - Calls your existing OnAccountInfoReceived + OnError.
    /// - You can yield on it if you only care about the ID (via OnUserIdRetrieved).
    /// </summary>
    public IEnumerator GetOtherPlayerPlayFabIdRoutine(string username)
    {
        bool isDone = false;
        PlayFabError errorResult = null;

        var request = new GetAccountInfoRequest
        {
            Username = username
        };

        PlayFabClientAPI.GetAccountInfo(
            request,
            result =>
            {
                // Reuse your existing logic
                OnAccountInfoReceived(result);
                isDone = true;
            },
            error =>
            {
                OnError(error);
                errorResult = error;
                isDone = true;
            });

        while (!isDone)
            yield return null;

        if (errorResult != null)
            yield break;
    }

    /// <summary>
    /// Coroutine wrapper around your existing OnAccountInfoReceived.
    /// Mostly here for completeness so you can yield on it if you ever want to.
    /// </summary>
    public IEnumerator OnAccountInfoReceivedRoutine(GetAccountInfoResult result)
    {
        OnAccountInfoReceived(result);
        yield break;
    }

    /// <summary>
    /// Coroutine version of GetUserDataSpecificWithID.
    /// - Fetches user data for (otherPlayfabID, key).
    /// - Fires:
    ///     - OnUserSpecificDataRetrieved(key, valueOrNull)
    ///     - OnUserSpecificDataError(errorMessage) on error
    /// </summary>
    public IEnumerator GetUserDataSpecificWithIDRoutine(string otherPlayfabID, string key)
    {
        bool isDone = false;
        PlayFabError errorResult = null;
        string specificData = null;

        PlayFabClientAPI.GetUserData(
            new GetUserDataRequest
            {
                PlayFabId = otherPlayfabID,
                Keys = new List<string> { key }
            },
            result =>
            {
                if (result.Data != null && result.Data.ContainsKey(key))
                {
                    specificData = result.Data[key].Value;
                    OnUserSpecificDataRetrieved.Invoke(key, specificData);
                }
                else
                {
                    OnUserSpecificDataRetrieved.Invoke(key, null);
                }

                isDone = true;
            },
            error =>
            {
                Debug.Log($"Could not retrieve user data | {error.ErrorMessage}");
                OnUserSpecificDataError?.Invoke(error.ErrorMessage);
                errorResult = error;
                isDone = true;
            });

        while (!isDone)
            yield return null;

        if (errorResult != null)
            yield break;
    }


    /// <summary>
    /// Coroutine version of SetUserData(string key, string userData).
    /// - Updates a single key/value pair on this user.
    /// - Fires:
    ///     - OnUserDataSet($"{key} successfully updated")
    ///     - OnUserDataError($"{key} update unsuccessful | {error.ErrorMessage}")
    /// - Lets you yield until the update finishes.
    /// </summary>
    public IEnumerator SetUserDataRoutine(string key, string userData)
    {
        bool isDone = false;
        PlayFabError errorResult = null;

        PlayFabClientAPI.UpdateUserData(
            new UpdateUserDataRequest
            {
                Data = new Dictionary<string, string>
                {
                    { key, userData }
                }
            },
            result =>
            {
                OnUserDataSet?.Invoke($"{key} successfully updated");
                Debug.Log($"{key} successfully updated");
                isDone = true;
            },
            error =>
            {
                OnUserDataError?.Invoke($"{key} update unsuccessful | {error.ErrorMessage}");
                Debug.Log($"{key} update unsuccessful | {error.ErrorMessage}");
                errorResult = error;
                isDone = true;
            });

        while (!isDone)
            yield return null;

        if (errorResult != null)
            yield break;
    }

    /// <summary>
    /// Coroutine version of GetAllUserDataKeys().
    /// - Calls GetUserData for the current player.
    /// - For each key that starts with "RoomDesign_", fires:
    ///     - OnUserDataRetrieved(key, value)
    /// - Same behaviour as original method, but you can now yield until it’s done.
    /// </summary>
    public IEnumerator GetAllUserDataKeysRoutine()
    {
        bool isDone = false;
        PlayFabError errorResult = null;

        PlayFabClientAPI.GetUserData(
            new GetUserDataRequest
            {
                PlayFabId = playfabID
            },
            result =>
            {
                if (result.Data != null)
                {
                    List<string> keys = new List<string>(result.Data.Keys);

                    foreach (string key in keys)
                    {
                        if (key.StartsWith("RoomDesign_"))
                        {
                            if (result.Data[key].Value != null)
                            {
                                OnUserDataRetrieved.Invoke(key, result.Data[key].Value);
                            }
                        }
                    }
                }

                isDone = true;
            },
            error =>
            {
                Debug.Log($"Could not retrieve user data keys | {error.ErrorMessage}");
                errorResult = error;
                isDone = true;
            });

        while (!isDone)
            yield return null;

        if (errorResult != null)
            yield break;
    }

    #endregion



    /*
        STATISTIC ROUTINES
        Coroutine versions of GetStatistic and SetStatistic
    */

    #region STATISTIC_ROUTINES

    /// <summary>
    /// Coroutine version of GetStatistic(string statistic).
    /// - Uses GetPlayerStatistics with a single statistic name.
    /// - On success:
    ///     - If a value exists, fires OnStatisticRetrieved(statistic, result.Statistics[0])
    /// - On error:
    ///     - Logs the error (same as original).
    /// </summary>
    public IEnumerator GetStatisticRoutine(string statistic)
    {
        bool isDone = false;
        PlayFabError errorResult = null;

        PlayFabClientAPI.GetPlayerStatistics(
            new GetPlayerStatisticsRequest
            {
                StatisticNames = new List<string> { statistic }
            },
            result =>
            {
                if (result.Statistics != null && result.Statistics.Count > 0)
                {
                    Debug.Log($"Successfully got {statistic} | {result.Statistics[0]}");
                    OnStatisticRetrieved?.Invoke(statistic, result.Statistics[0]);
                }
                else
                {
                    Debug.Log($"No existing statistic [{statistic}] for user");
                }

                isDone = true;
            },
            error =>
            {
                Debug.Log($"Could not retrieve {statistic} | {error.ErrorMessage}");
                errorResult = error;
                isDone = true;
            });

        while (!isDone)
            yield return null;

        if (errorResult != null)
            yield break;
    }

    /// <summary>
    /// Coroutine version of SetStatistic(string statistic, int value).
    /// - Updates the player statistic.
    /// - On success:
    ///     - Logs success
    ///     - Calls GetLeaderboard(statistic) (same as original)
    /// - On error:
    ///     - Logs the error
    /// - Lets you wait until the update request has completed.
    /// </summary>
    public IEnumerator SetStatisticRoutine(string statistic, int value)
    {
        bool isDone = false;
        PlayFabError errorResult = null;

        PlayFabClientAPI.UpdatePlayerStatistics(
            new UpdatePlayerStatisticsRequest
            {
                Statistics = new List<StatisticUpdate>
                {
                    new StatisticUpdate
                    {
                        StatisticName = statistic,
                        Value = value
                    }
                }
            },
            result =>
            {
                Debug.Log($"{statistic} successfully updated");
                // Keep original behaviour: refresh leaderboard
                GetLeaderboard(statistic);
                isDone = true;
            },
            error =>
            {
                Debug.Log($"{statistic} update unsuccessful | {error.ErrorMessage}");
                errorResult = error;
                isDone = true;
            });

        while (!isDone)
            yield return null;

        if (errorResult != null)
            yield break;
    }



    /// <summary>
    /// Coroutine version of GetLeaderboard(string statistic).
    /// - Same logic as original:
    ///     - Calls PlayFabClientAPI.GetLeaderboard
    ///     - Logs success/error
    ///     - Invokes OnLeaderboardRetrieved(statistic, result.Leaderboard)
    /// - Lets you yield until the request finishes.
    /// </summary>
    public IEnumerator GetLeaderboardRoutine(string statistic)
    {
        bool isDone = false;
        PlayFabError errorResult = null;

        PlayFabClientAPI.GetLeaderboard(
            new GetLeaderboardRequest
            {
                StatisticName = statistic
            },
            result =>
            {
                if (result.Leaderboard != null && result.Leaderboard.Count > 0)
                {
                    Debug.Log($"Successfully got {statistic} leaderboard | 0.{result.Leaderboard[0].DisplayName} {result.Leaderboard[0].StatValue}");
                }
                else
                {
                    Debug.Log($"Successfully got {statistic} leaderboard but it is empty.");
                }

                OnLeaderboardRetrieved.Invoke(statistic, result.Leaderboard);
                isDone = true;
            },
            error =>
            {
                Debug.Log($"Could not retrieve {statistic} leaderboard | {error.ErrorMessage}");
                errorResult = error;
                isDone = true;
            });

        while (!isDone)
            yield return null;

        if (errorResult != null)
            yield break;
    }

    #endregion



    /*
        USER DATA REMOVE ROUTINES
        Coroutine versions of RemoveUserData
    */

    #region USERDATA_REMOVE_ROUTINES

    /// <summary>
    /// Coroutine version of RemoveUserData(string key).
    /// - Same logic as original:
    ///     - Calls UpdateUserData with KeysToRemove
    ///     - On success: logs and calls GetAllUserDataKeys()
    ///     - On error: logs error
    /// - Lets you yield until the remove finishes.
    /// </summary>
    public IEnumerator RemoveUserDataRoutine(string key)
    {
        bool isDone = false;
        PlayFabError errorResult = null;

        PlayFabClientAPI.UpdateUserData(
            new UpdateUserDataRequest
            {
                KeysToRemove = new List<string> { key }
            },
            result =>
            {
                Debug.Log($"{key} successfully removed");
                GetAllUserDataKeys();
                isDone = true;
            },
            error =>
            {
                Debug.Log($"{key} update unsuccessful | {error.ErrorMessage}");
                errorResult = error;
                isDone = true;
            });

        while (!isDone)
            yield return null;

        if (errorResult != null)
            yield break;
    }

    #endregion



    /*
        RECOVER PASSWORD ROUTINES
        Coroutine versions of RecoverPassword
    */

    #region RECOVER_PASSWORD_ROUTINES

    /// <summary>
    /// Coroutine version of RecoverPassword(string email).
    /// - Same logic as original:
    ///     - Sends account recovery email
    ///     - On success: OnRecoverEmailSuccess("sent recovery email")
    ///     - On error: OnRecoverEmailFailed(errorMessage) + OnError(error)
    /// - Lets you yield until the email request finishes.
    /// </summary>
    public IEnumerator RecoverPasswordRoutine(string email)
    {
        bool isDone = false;
        PlayFabError errorResult = null;

        var request = new SendAccountRecoveryEmailRequest
        {
            Email = email,
            TitleId = PlayFabSettings.TitleId
        };

        PlayFabClientAPI.SendAccountRecoveryEmail(
            request,
            result =>
            {
                OnRecoverEmailSuccess.Invoke("sent recovery email");
                isDone = true;
            },
            error =>
            {
                OnRecoverEmailFailed.Invoke(error.ErrorMessage);
                OnError(error);
                errorResult = error;
                isDone = true;
            });

        while (!isDone)
            yield return null;

        if (errorResult != null)
            yield break;
    }

    #endregion



    /*
        DEMO ROOM PUBLISH ROUTINES
        Coroutine wrapper for OnSuccessCreationPublishDemoRoom
    */

    #region DEMO_ROOM_ROUTINES

    /// <summary>
    /// Coroutine wrapper for OnSuccessCreationPublishDemoRoom().
    /// - Currently just calls the original method and finishes.
    /// - Use this if you want to keep your flow coroutine-based.
    /// </summary>
    public IEnumerator OnSuccessCreationPublishDemoRoomRoutine()
    {
        OnSuccessCreationPublishDemoRoom();
        yield break;
    }
    #endregion


}