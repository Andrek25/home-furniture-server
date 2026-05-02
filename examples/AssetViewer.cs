
using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Threading.Tasks;
using TriLibCore.SFB;
using TriLibCore.Extensions;
using TriLibCore.Extras;
using TriLibCore.Utils;
using Unity.Mathematics;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;
using UnityEngine.Profiling;
using Photon.Pun;
using Debug = UnityEngine.Debug;
using Obvious.Soap;
using UnityEngine.InputSystem;
//using UnityEngine.UIElements;

namespace TriLibCore.Samples
{
    /// <summary>Represents a TriLib sample which allows the user to load models and HDR skyboxes from the local file-system.</summary>
    public class AssetViewer : AssetViewerBase
    {
        //private const string NextSceneName = "Multi_RoomEditor";

        public RectTransform NextButton;


        public bool IsAddSpawnPlace;
        public bool IsAddLoadedSpawn;

        public GameObject SpawningPlacePrefab;

        private Transform _spawnPlace;
        #region Probably_Not_Gonna_Touch_Variables
        /// <summary>
        /// Maximum camera distance ratio based on model bounds.
        /// </summary>
        private const float MaxCameraDistanceRatio = 3f;

        /// <summary>
        /// Camera distance ratio based on model bounds.
        /// </summary>
        protected const float CameraDistanceRatio = 2f;

        /// <summary>
        /// minimum camera distance.
        /// </summary>
        protected const float MinCameraDistance = 0.01f;

        /// <summary>
        /// Skybox scale based on model bounds.
        /// </summary>
        protected const float SkyboxScale = 100f;

        /// <summary>
        /// Skybox game object.
        /// </summary>
        [SerializeField]
        protected GameObject Skybox;

        /// <summary>
        /// Scene CanvasScaler.
        /// </summary>
        [SerializeField]
        protected CanvasScaler CanvasScaler;

        /// <summary>
        /// Camera selection Dropdown.
        /// </summary>
        [SerializeField]
        private Dropdown _camerasDropdown;

        /// <summary>
        /// Camera loading Toggle.
        /// </summary>
        [SerializeField]
        private Toggle _loadCamerasToggle;

        /// <summary>
        /// Lights loading Toggle.
        /// </summary>
        [SerializeField]
        private Toggle _loadLightsToggle;

        /// <summary>
        /// Point Clouds loading Toggle.
        /// </summary>
        [SerializeField]
        private Toggle _loadPointClouds;

        /// <summary>
        /// Skybox game object renderer.
        /// </summary>
        [SerializeField]
        private Renderer _skyboxRenderer;

        /// <summary>
        /// Directional light.
        /// </summary>
        [SerializeField]
        private Light _light;

        /// <summary>
        /// Skybox material preset to create the final skybox material.
        /// </summary>
        [SerializeField]
        private Material _skyboxMaterialPreset;

        /// <summary>
        /// Main reflection probe.
        /// </summary>
        [SerializeField]
        private ReflectionProbe _reflectionProbe;

        /// <summary>
        /// Skybox exposure slider.
        /// </summary>
        [SerializeField]
        private Slider _skyboxExposureSlider;

        /// <summary>
        /// Loading time indicator.
        /// </summary>
        [SerializeField]
        private Text _loadingTimeText;

        /// <summary>
        /// Memory usage Text.
        /// </summary>
        [SerializeField]
        private Text _memoryUsageText;

        /// <summary>
        /// Error panel.
        /// </summary>
        [SerializeField]
        private GameObject _errorPanel;

        /// <summary>
        /// Error panel inner text.
        /// </summary>
        [SerializeField]
        private Text _errorPanelText;

        /// <summary>
        /// Main scene Camera.
        /// </summary>
        [SerializeField]
        private Camera _mainCamera;

        /// <summary>
        /// Debug options dropdown;
        /// </summary>
        [SerializeField]
        private Dropdown _debugOptionsDropdown;

        /// <summary>
        /// Text used to display the used memory per object type.
        /// </summary>
        [SerializeField]
        private Text _usedMemoryText;

        /// <summary>
        /// Text used to display the "Point Size" label.
        /// </summary>
        [SerializeField]
        private GameObject _pointSizeLabel;

        /// <summary>
        /// Wrapper that contains the point size slider.
        /// </summary>
        [SerializeField]
        private GameObject _pointCloudSizeWrapper;

        /// <summary>
        /// Point size slider.
        /// </summary>
        [SerializeField]
        private Slider _pointSizeSlider;


        /// <summary>
        /// Current camera distance.
        /// </summary>
        protected float CameraDistance = 1f;

        /// <summary>
        /// Current camera pivot position.
        /// </summary>
        protected Vector3 CameraPivot;

        /// <summary>
        /// Input multiplier based on loaded model bounds.
        /// </summary>
        protected float InputMultiplier = 1f;

        /// <summary>
        /// Skybox instantiated material.
        /// </summary>
        private Material _skyboxMaterial;

        /// <summary>
        /// Texture loaded for skybox.
        /// </summary>
        private Texture2D _skyboxTexture;

        /// <summary>
        /// List of loaded animations.
        /// </summary>
        private List<AnimationClip> _animations;

        /// <summary>
        /// Created animation component for the loaded model.
        /// </summary>
        private Animation _animation;

        /// <summary>
        /// Loaded model cameras.
        /// </summary>
        private IList<Camera> _cameras;

        /// <summary>
        /// Stop Watch used to track the model loading time.
        /// </summary>
        private Stopwatch _stopwatch;

        /// <summary>
        /// Current directional light angle.
        /// </summary>
        private Vector2 _lightAngle = new Vector2(0f, -45f);

        /// <summary>
        /// Reference to the ShowSkeleton behavior added to the loaded game object.
        /// </summary>
        private ShowSkeleton _showSkeleton;

        /// <summary>
        /// Reference to the shader used to display normals.
        /// </summary>
        private Shader _showNormalsShader;

        /// <summary>
        /// Reference to the shader used to display metallic.
        /// </summary>
        private Shader _showMetallicShader;

        /// <summary>
        /// Reference to the shader used to display smooth.
        /// </summary>
        private Shader _showSmoothShader;

        /// <summary>
        /// Reference to the shader used to display albedo.
        /// </summary>
        private Shader _showAlbedoShader;

        /// <summary>
        /// Reference to the shader used to display emission.
        /// </summary>
        private Shader _showEmissionShader;

        /// <summary>
        /// Reference to the shader used to display occlusion.
        /// </summary>
        private Shader _showOcclusionShader;
        #endregion




        public GameObject GroundPlane;
        public GameObject SpwanPanel;

        public bool IsShoosingSpawnPlace = true;
        [Space(10)]
        [Header("Soap Related")]
        [Header("Show Messege for assigning new entrance")]
        [SerializeField] ScriptableEventBool ShowMessegeToAssignNewEntrance;
        [Space(5)]
        [Header("First State for choosing new entrance position")]
        [SerializeField] ScriptableEventVector3 AssignEntrancePosition;
        [Space(5)]
        [Header("Second  State for choosing new entrance position")]
        [SerializeField] ScriptableEventVector3 AssignEntranceDirection;
        [Space(5)]
        [Header("Ending choosing new position")]
        [SerializeField] BoolVariable IsEntranceSet;
        [SerializeField] ScriptableEventNoParam MoveEntranceToTheCurrentValues;


        [Space]

        [SerializeField] Vector3Variable EntrancePosition;
        [SerializeField] Vector3Variable EntranceDirection;

        [Space]
        [Header("Spawner Soap Related")]
        [SerializeField] BoolVariable IsChosingSpawnerDirectionPhase;
        [SerializeField] Vector3Variable SpawnerDirection;
        [SerializeField] ScriptableEventVector3 AssignSpawneDirection;

        private void OnEnable()
        {
            AssignEntrancePosition.OnRaised+=AssignEntrancePosition_OnRaised;
            AssignEntranceDirection.OnRaised+=AssignEntranceDirection_OnRaised;
            IsEntranceSet.OnValueChanged +=IsEntranceSet_OnValueChanged;
            AssignSpawneDirection.OnRaised += AssignSpawneDirection_OnRaised;
        }

        

        private void OnDisable()
        {
            AssignEntrancePosition.OnRaised-=AssignEntrancePosition_OnRaised;
            AssignEntranceDirection.OnRaised-=AssignEntranceDirection_OnRaised;
            IsEntranceSet.OnValueChanged-=IsEntranceSet_OnValueChanged;
            AssignSpawneDirection.OnRaised -= AssignSpawneDirection_OnRaised;
        }

        #region Event_Soap_Handlers
        private void AssignEntrancePosition_OnRaised(Vector3 val)
        {
            BackgroundLevelInfo.instance.EntrancePosition = val;
        }

        private void AssignEntranceDirection_OnRaised(Vector3 val)
        {
            BackgroundLevelInfo.instance.EntranceDirection = val;
            if (isLoadedBefore)
            {
                var fw = SessionInfo.RoomData.RoomWrapper;

                fw.EntrancePosition = BackgroundLevelInfo.instance.EntrancePosition;
                fw.EntranceDirection = BackgroundLevelInfo.instance.EntranceDirection;
                fw.IsEntranceSet = BackgroundLevelInfo.instance.IsEntranceSet;

                UserAccountManager.Instance.SetUserData("RoomDesign_" + fw.SceneBaseID, fw.ConvertToJSON());
            }

        }

        private void AssignSpawneDirection_OnRaised(Vector3 val)
        {
            BackgroundLevelInfo.instance.SpawnDirection = val;
            if (isLoadedBefore)
            {
                var fw = SessionInfo.RoomData.RoomWrapper;
                fw.SpawnDirection = val;
                UserAccountManager.Instance.SetUserData("RoomDesign_" + fw.SceneBaseID, fw.ConvertToJSON());
            }
            IsChosingSpawnerDirectionPhase.Value = false;
            Ui_OnSetSpawnCancelButtonPressed();
        }

        private void IsEntranceSet_OnValueChanged(bool val)
        {
            BackgroundLevelInfo.instance.IsEntranceSet = val;
        }

        #endregion
        /// <summary>Is there any animation playing?</summary>
        private bool AnimationIsPlaying => _animation != null && _animation.isPlaying;

        /// <summary>
        /// Shows the file picker for loading a model from the local file-system.
        /// </summary>
        public void LoadModelFromFile()
        {
            AssetLoaderOptions.ImportCameras = _loadCamerasToggle.isOn;
            AssetLoaderOptions.ImportLights = _loadLightsToggle.isOn;
            AssetLoaderOptions.LoadPointClouds = _loadPointClouds.isOn;
            base.LoadModelFromFile();
        }

        /// <summary>
        /// Shows the URL selector for loading a model from network.
        /// </summary>
        public void LoadModelFromURLWithDialogValues()
        {
            AssetLoaderOptions.ImportCameras = _loadCamerasToggle.isOn;
            AssetLoaderOptions.ImportLights = _loadLightsToggle.isOn;
            AssetLoaderOptions.LoadPointClouds = _loadPointClouds.isOn;
            base.LoadModelFromURLWithDialogValues();
        }

        #region Probably_Not_Gonna_Touch

        public void OnPointCloudToggleChanged(bool value)
        {
            _pointCloudSizeWrapper.SetActive(value);
            _pointSizeLabel.SetActive(value);
        }
        /// <summary>Gets the playing Animation State.</summary>
        private AnimationState CurrentAnimationState
        {
            get
            {
                if (_animation != null)
                {
                    return _animation[PlaybackAnimation.options[PlaybackAnimation.value].text];
                }
                return null;
            }
        }


        /// <summary>
        /// Updates the memory usage text.
        /// </summary>
        private void ShowMemoryUsage()
        {
#if TRILIB_SHOW_MEMORY_USAGE
            var memory = RuntimeProcessUtils.GetProcessMemory();
            var managedMemory = GC.GetTotalMemory(false);
            PeakMemory = Math.Max(memory, PeakMemory);
            PeakManagedMemory = Math.Max(managedMemory, PeakManagedMemory); 
            _memoryUsageText.text = $"(Total: {ProcessUtils.SizeSuffix(memory)} Peak: {ProcessUtils.SizeSuffix(PeakMemory)}) (Managed: {ProcessUtils.SizeSuffix(managedMemory)} Peak: {ProcessUtils.SizeSuffix(PeakManagedMemory)})";
#else
            var memory = GC.GetTotalMemory(false);
            PeakMemory = Math.Max(memory, PeakMemory);
            _memoryUsageText.text = $"Total: {ProcessUtils.SizeSuffix(memory)} Peak: {ProcessUtils.SizeSuffix(PeakMemory)}";
#endif
        }
        /// <summary>Shows the file picker for loading a skybox from the local file-system.</summary>
        public void LoadSkyboxFromFile()
        {
            SetLoading(false);
            var title = "Select a skybox image";
            var extensions = new ExtensionFilter[]
            {
                new ExtensionFilter("Radiance HDR Image (hdr)", "hdr")
            };
            StandaloneFileBrowser.OpenFilePanelAsync(title, null, extensions, true, OnSkyboxStreamSelected);
        }

        /// <summary>
        /// Removes the skybox texture.
        /// </summary>
        public void ClearSkybox()
        {
            if (_skyboxMaterial == null)
            {
                _skyboxMaterial = Instantiate(_skyboxMaterialPreset);
            }
            _skyboxMaterial.mainTexture = null;
            _skyboxExposureSlider.value = 1f;
            OnSkyboxExposureChanged(1f);
        }

        /// <summary>
        /// Resets the model scale when loading a new model.
        /// </summary>
        public void ResetModelScale()
        {
            if (RootGameObject != null)
            {
                RootGameObject.transform.localScale = Vector3.one;
            }
        }

        /// <summary>
        /// Plays the selected animation.
        /// </summary>
        public override void PlayAnimation()
        {
            if (_animation == null)
            {
                return;
            }
            _animation.Play(PlaybackAnimation.options[PlaybackAnimation.value].text, PlayMode.StopAll);
        }

        /// <summary>
        /// Stop playing the selected animation.
        /// </summary>
        public override void StopAnimation()
        {
            if (_animation == null)
            {
                return;
            }
            PlaybackSlider.value = 0f;
            _animation.Stop();
            SampleAnimationAt(0f);
        }

        /// <summary>Switches to the animation selected on the Dropdown.</summary>
        /// <param name="index">The selected Animation index.</param>
        public override void PlaybackAnimationChanged(int index)
        {
            StopAnimation();
        }


        /// <summary>Switches to the camera selected on the Dropdown.</summary>
        /// <param name="index">The selected Camera index.</param>
        public void CameraChanged(int index)
        {
            for (var i = 0; i < _cameras.Count; i++)
            {
                var camera = _cameras[i];
                camera.enabled = false;
            }
            if (index == 0)
            {
                _mainCamera.enabled = true;
            }
            else
            {
                _cameras[index - 1].enabled = true;
            }
        }

        /// <summary>Event triggered when the Animation slider value has been changed by the user.</summary>
        /// <param name="value">The Animation playback normalized position.</param>
        public override void PlaybackSliderChanged(float value)
        {
            if (!AnimationIsPlaying)
            {
                var animationState = CurrentAnimationState;
                if (animationState != null)
                {
                    SampleAnimationAt(value);
                }
            }
        }

        /// <summary>Samples the Animation at the given normalized time.</summary>
        /// <param name="value">The Animation normalized time.</param>
        private void SampleAnimationAt(float value)
        {
            if (_animation == null || RootGameObject == null)
            {
                return;
            }
            var animationClip = _animation.GetClip(PlaybackAnimation.options[PlaybackAnimation.value].text);
            animationClip.SampleAnimation(RootGameObject, animationClip.length * value);
        }


        /// <summary>
        /// Event triggered when the user selects the skybox on the selection dialog.
        /// </summary>
        /// <param name="files">Selected files.</param>
        private void OnSkyboxStreamSelected(IList<ItemWithStream> files)
        {
            if (files != null && files.Count > 0 && files[0].HasData)
            {
                Utils.Dispatcher.InvokeAsyncUnchecked(LoadSkybox, files[0].OpenStream());
            }
            else
            {
                Utils.Dispatcher.InvokeAsync(ClearSkybox);
            }
        }

        /// <summary>
        /// Event triggered when the user changes the debug options dropdown value.
        /// </summary>
        /// <param name="value">The dropdown value.</param>
        public void OnDebugOptionsDropdownChanged(int value)
        {
            switch (value)
            {
                default:
                    if (_showSkeleton != null)
                    {
                        _showSkeleton.enabled = value == 1;
                    }
                    _mainCamera.ResetReplacementShader();
                    _mainCamera.renderingPath = RenderingPath.UsePlayerSettings;
                    break;
                case 2:
                    _mainCamera.SetReplacementShader(_showAlbedoShader, null);
                    _mainCamera.renderingPath = RenderingPath.Forward;
                    break;
                case 3:
                    _mainCamera.SetReplacementShader(_showEmissionShader, null);
                    _mainCamera.renderingPath = RenderingPath.Forward;
                    break;
                case 4:
                    _mainCamera.SetReplacementShader(_showOcclusionShader, null);
                    _mainCamera.renderingPath = RenderingPath.Forward;
                    break;
                case 5:
                    _mainCamera.SetReplacementShader(_showNormalsShader, null);
                    _mainCamera.renderingPath = RenderingPath.Forward;
                    break;
                case 6:
                    _mainCamera.SetReplacementShader(_showMetallicShader, null);
                    _mainCamera.renderingPath = RenderingPath.Forward;
                    break;
                case 7:
                    _mainCamera.SetReplacementShader(_showSmoothShader, null);
                    _mainCamera.renderingPath = RenderingPath.Forward;
                    break;
            }
        }
        /// <summary>Loads the skybox from the given Stream.</summary>
        /// <param name="stream">The Stream containing the HDR Image data.</param>
        /// <returns>Coroutine IEnumerator.</returns>
        private IEnumerator DoLoadSkybox(Stream stream)
        {
            //Double frame waiting hack
            yield return new WaitForEndOfFrame();
            yield return new WaitForEndOfFrame();
            if (_skyboxTexture != null)
            {
                Destroy(_skyboxTexture);
            }
            ClearSkybox();
            _skyboxTexture = HDRLoader.HDRLoader.Load(stream, out var gamma, out var exposure);
            _skyboxMaterial.mainTexture = _skyboxTexture;
            _skyboxExposureSlider.value = 1f;
            OnSkyboxExposureChanged(exposure);
            stream.Close();
            SetLoading(false);
        }

        /// <summary>Starts the Coroutine to load the skybox from the given Stream.</summary>
        /// <param name="stream">The Stream containing the HDR Image data.</param>
        private void LoadSkybox(Stream stream)
        {
            SetLoading(true);
            StartCoroutine(DoLoadSkybox(stream));
        }

        /// <summary>Event triggered when the skybox exposure Slider has changed.</summary>
        /// <param name="exposure">The new exposure value.</param>
        public void OnSkyboxExposureChanged(float exposure)
        {
            _skyboxMaterial.SetFloat("_Exposure", exposure);
            _skyboxRenderer.material = _skyboxMaterial;
            RenderSettings.skybox = _skyboxMaterial;
            DynamicGI.UpdateEnvironment();
            _reflectionProbe.RenderProbe();
        }
        /// <summary>
        /// Handles the input using the given Camera.
        /// </summary>
        /// <param name="cameraTransform">The Camera to process input movements.</param>
        private void ProcessInputInternal(Transform cameraTransform)
        {
            if (EventSystem.current!=null && !EventSystem.current.IsPointerOverGameObject())
            {
                if (GetMouseButton(0))
                {
                    if(Keyboard.current.leftAltKey.isPressed || Keyboard.current.rightAltKey.isPressed)
                    {
                        _lightAngle.x = Mathf.Repeat(_lightAngle.x + GetAxis("Mouse X"), 360f);
                        _lightAngle.y = Mathf.Clamp(_lightAngle.y + GetAxis("Mouse Y"), -MaxPitch, MaxPitch);
                    }
                    else
                    {
                        UpdateCamera();
                    }
                }
                if (GetMouseButton(2))
                {
                    CameraPivot -= cameraTransform.up * GetAxis("Mouse Y") * InputMultiplier + cameraTransform.right * GetAxis("Mouse X") * InputMultiplier;
                }
                CameraDistance = Mathf.Min(CameraDistance - GetMouseScrollDelta().y * InputMultiplier, InputMultiplier * (1f / InputMultiplierRatio) * MaxCameraDistanceRatio);
                if (CameraDistance < 0f)
                {
                    CameraPivot += cameraTransform.forward * -CameraDistance;
                    CameraDistance = 0f;
                }
                Skybox.transform.position = CameraPivot;
                cameraTransform.position = CameraPivot + Quaternion.AngleAxis(CameraAngle.x, Vector3.up) * Quaternion.AngleAxis(CameraAngle.y, Vector3.right) * new Vector3(0f, 0f, Mathf.Max(MinCameraDistance, CameraDistance));
                cameraTransform.LookAt(CameraPivot);
                _light.transform.position = CameraPivot + Quaternion.AngleAxis(_lightAngle.x, Vector3.up) * Quaternion.AngleAxis(_lightAngle.y, Vector3.right) * Vector3.forward;
                _light.transform.LookAt(CameraPivot);
            }
        }

        /// <summary>Updates the HUD information.</summary>
        private void UpdateHUD()
        {
            var animationState = CurrentAnimationState;
            var time = animationState == null ? 0f : PlaybackSlider.value * animationState.length % animationState.length;
            var seconds = time % 60f;
            var milliseconds = time * 100f % 100f;
            PlaybackTime.text = $"{seconds:00}:{milliseconds:00}";
            var normalizedTime = animationState == null ? 0f : animationState.normalizedTime % 1f;
            if (AnimationIsPlaying)
            {
                PlaybackSlider.value = float.IsNaN(normalizedTime) ? 0f : normalizedTime;
            }
            var animationIsPlaying = AnimationIsPlaying;
            if (_animation != null)
            {
                Play.gameObject.SetActive(!animationIsPlaying);
                Stop.gameObject.SetActive(animationIsPlaying);
            }
            else
            {
                Play.gameObject.SetActive(true);
                Stop.gameObject.SetActive(false);
                PlaybackSlider.value = 0f;
            }
        }

        /// <summary>Event triggered when the user selects a file or cancels the Model selection dialog.</summary>
        /// <param name="hasFiles">If any file has been selected, this value is <c>true</c>, otherwise it is <c>false</c>.</param>
        protected override void OnBeginLoadModel(bool hasFiles)
        {
            base.OnBeginLoadModel(hasFiles);
            if (hasFiles)
            {
                if (Application.GetStackTraceLogType(LogType.Exception) != StackTraceLogType.None || Application.GetStackTraceLogType(LogType.Error) != StackTraceLogType.None)
                {
                    _errorPanel.SetActive(false);
                }
                _animations = null;
                _loadingTimeText.text = null;
                _stopwatch = new Stopwatch();
                _stopwatch.Start();
            }
        }

        #endregion

        public void OnPointSizeSliderChanged(float value)
        {
            var pointRenderers = FindObjectsOfType<PointRenderer>();
            foreach (var pointRenderer in pointRenderers)
            {
                pointRenderer.PointSize = value;
            }
        }

        /// <summary>Initializes the viewer.</summary>
        protected override void Start()
        {
            base.Start();
            if (SystemInfo.deviceType == DeviceType.Handheld)
            {
                CanvasScaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            }
            if (AssetLoaderOptions == null)
            {
                AssetLoaderOptions = AssetLoader.CreateDefaultLoaderOptions(false, true);
                AssetLoaderOptions.Timeout = 160;
                AssetLoaderOptions.ShowLoadingWarnings = true;
                AssetLoaderOptions.UseUnityNativeTextureLoader = true; // Commenting/removing this line makes TriLib accept more texture file formats, but it will use more memory to load textures.
                AssetLoaderOptions.UseUnityNativeNormalCalculator = true; // Commenting/removing this line makes TriLib calculate normals with more options, but it will use more memory to calculate normals.
                AssetLoaderOptions.GenerateColliders = true;
            }

            _showNormalsShader = Shader.Find("Hidden/ShowNormals");
            _showMetallicShader = Shader.Find("Hidden/ShowMetallic");
            _showSmoothShader = Shader.Find("Hidden/ShowSmooth");
            _showAlbedoShader = Shader.Find("Hidden/ShowAlbedo");
            _showOcclusionShader = Shader.Find("Hidden/ShowOcclusion");
            _showEmissionShader = Shader.Find("Hidden/ShowEmission");
            ClearSkybox();
            InvokeRepeating("ShowMemoryUsage", 0f, 1f);
            //Debug.Log(RootGameObject.transform.name);


            //Debug.Log("IsConnected " + PhotonNetwork.IsConnected+ ", InRoom" + PhotonNetwork.InRoom +", BackgroundUrl"+ PhotonNetwork.CurrentRoom.CustomProperties["BackgroundUrl"]);



            //if (PhotonNetwork.IsConnected)
            //{
            //    if (!PhotonNetwork.IsMessageQueueRunning)
            //    {
            //        PhotonNetwork.IsMessageQueueRunning = true;
            //    }
            //}

            StartConsiderAction();
        }


        public void StartConsiderAction()
        {
            isPrivateApi = true;
            //string url = "";
            if (SessionInfo.RoomData != null && (SessionInfo.RoomData.ChoosenSession != SessionType.Local))
            //||(SessionInfo.RoomData.ChoosenSession == SessionType.JoinMultiplayer) )
            {
                if (SessionInfo.RoomData.ChoosenSession == SessionType.JoinMultiplayer)
                {
                    //if (PhotonNetwork.IsConnected && PhotonNetwork.InRoom && !string.IsNullOrEmpty((url = (string)PhotonNetwork.CurrentRoom.CustomProperties["BackgroundUrl"])))
                    //{

                    //    DriveLink =url;
                    //    isLoadAutomatically = true;
                    //    isLoadedBefore = true;
                    //    isDriveApiNew = true;
                    //    LoadModelFromURLWithDialogValues();
                    //    //assetViewer.DriveLink = Url;
                    //    //assetViewer.isLoadedBefore = isLoadedBefore;

                    urlLink = (string)SessionInfo.RoomData.RoomCustomProperties[MultiplayerTerms.BackgroundUrl];
                    isLoadedBefore = true;
                    isLoadAutomatically = true;
                    isPrivateApi = true;
                    LoadModelFromURLWithDialogValues();

                    //}

                    //TODO Room Action

                }
                else switch (SessionInfo.RoomData.LeaveAction)
                    {
                        case RoomSavedLeaveSceneAction.UploadNew:
                            {
                                isLoadedBefore = false;
                                break;
                            }
                        case RoomSavedLeaveSceneAction.LoadOldRoom:
                            {
                                urlLink = SessionInfo.RoomData.RoomWrapper.OriginUrl;
                                //RoomSavedManager.instance.FurnitureWrapper = RoomSavedManager.instance.MultiplayerRoomSavedDetails.RoomJsonWrapper;
                                isLoadedBefore = true;
                                isPrivateApi = true;
                                //isLoadAutomatically = true;
                                //isDriveApiNew = true;
                                LoadModelFromURLWithDialogValues();
                                break;
                            }
                        case RoomSavedLeaveSceneAction.LoadLink:
                            {
                                //Ui_OnLinkButtonPressed();
                                isLoadedBefore = true;
                                isPrivateApi = true;
                                //isLoadAutomatically = true;
                                //isDriveApiNew = true;
                                break;
                            }
                    }

            }

            else
            {
                //if (RoomSavedManager.instance != null)
                //{

                //    isLoadedBefore = RoomSavedManager.instance.isLoadedScene;
                //    isLoadAutomatically = RoomSavedManager.instance.isLoadAutomatically;
                //}

                //if()
                switch (SessionInfo.RoomData.LeaveAction)
                {
                    case RoomSavedLeaveSceneAction.UploadNew:
                        {
                            isLoadedBefore = false;
                            break;
                        }
                    case RoomSavedLeaveSceneAction.LoadOldRoom:
                        {
                            urlLink = SessionInfo.RoomData.RoomWrapper.OriginUrl;
                            isLoadedBefore = true;
                            isLoadAutomatically = true;
                            break;
                        }
                    case RoomSavedLeaveSceneAction.LoadLink:
                        {
                            break;
                        }




                }

                if (MouseWorldAssetUploader.instance != null)
                {
                    MouseWorldAssetUploader.instance.gameObject.SetActive(false);
                }

                if (isLoadedBefore && isLoadAutomatically)
                {
                    urlLink = SessionInfo.RoomData.RoomWrapper.OriginUrl;
                    LoadModelFromURLWithDialogValues();
                    // LoadOldScene();
                }
            }
        }


        /// <summary>Handles the input.</summary>
        private void Update()
        {
            ProcessInput();
            UpdateHUD();
        }

        /// <summary>Handles the input and moves the Camera accordingly.</summary>
        protected virtual void ProcessInput()
        {
            if (!_mainCamera.enabled)
            {
                return;
            }

            if (!IsShoosingSpawnPlace && !IsChosingSpawnerDirectionPhase.Value)
            {
                ProcessInputInternal(_mainCamera.transform);
            }
            else if (IsShoosingSpawnPlace)
            {

                if (EventSystem.current!=null &&!EventSystem.current.IsPointerOverGameObject())
                {
                    if (GetMouseButton(0))
                    {
                        SetSpwanPlaceUsingMouse();
                        // Ui_OnSetSpawnCancelButtonPressed();

                    }
                }

            }
            //else if (IsChosingSpawnerDirectionPhase.Value)
            //{
            //    if (!EventSystem.current.IsPointerOverGameObject())
            //    {
            //        if (GetMouseButton(0))
            //        {
            //            SetSpwanDirectionUsingMouse();
            //            // Ui_OnSetSpawnCancelButtonPressed();

            //        }
            //    }
            //}
        }



        /// <summary>Event triggered when the Model Meshes and hierarchy are loaded.</summary>
        /// <param name="assetLoaderContext">The Asset Loader Context reference. Asset Loader Context contains the Model loading data.</param>
        protected override void OnLoad(AssetLoaderContext assetLoaderContext)
        {
            base.OnLoad(assetLoaderContext);
            ResetModelScale();
            _camerasDropdown.options.Clear();
            PlaybackAnimation.options.Clear();
            _cameras = null;
            _animation = null;
            _mainCamera.enabled = true;
            if (assetLoaderContext.RootGameObject != null)
            {
                if (assetLoaderContext.Options.ImportCameras)
                {
                    _cameras = assetLoaderContext.RootGameObject.GetComponentsInChildren<Camera>();
                    if (_cameras.Count > 0)
                    {
                        _camerasDropdown.gameObject.SetActive(true);
                        _camerasDropdown.options.Add(new Dropdown.OptionData("User Camera"));
                        for (var i = 0; i < _cameras.Count; i++)
                        {
                            var camera = _cameras[i];
                            camera.enabled = false;
                            _camerasDropdown.options.Add(new Dropdown.OptionData(camera.name));
                        }
                        _camerasDropdown.captionText.text = _cameras[0].name;
                    }
                    else
                    {
                        _cameras = null;
                    }
                }
                _animation = assetLoaderContext.RootGameObject.GetComponent<Animation>();
                if (_animation != null)
                {
                    _animations = _animation.GetAllAnimationClips();
                    if (_animations.Count > 0)
                    {
                        PlaybackAnimation.interactable = true;
                        for (var i = 0; i < _animations.Count; i++)
                        {
                            var animationClip = _animations[i];
                            PlaybackAnimation.options.Add(new Dropdown.OptionData(animationClip.name));
                        }
                        PlaybackAnimation.captionText.text = _animations[0].name;
                    }
                    else
                    {
                        _animation = null;
                    }
                }
                _camerasDropdown.value = 0;
                PlaybackAnimation.value = 0;
                StopAnimation();
                RootGameObject = assetLoaderContext.RootGameObject;
            }
            if (_cameras == null)
            {
                _camerasDropdown.gameObject.SetActive(false);
            }
            if (_animation == null)
            {
                PlaybackAnimation.interactable = false;
                PlaybackAnimation.captionText.text = "No Animations";
            }
            // TMPUGUI.text = RootGameObject.name;




        }



        private async void LoadOldScene()
        {
            await Task.Delay(1500);
            DontDestroyOnLoad(RootGameObject);
            BackgroundLevelInfo.instance.SetOldId(SessionInfo.RoomData.RoomWrapper.SceneBaseID);
            //if (PhotonNetwork.IsConnected)
            //{
            //    if (PhotonNetwork.IsMessageQueueRunning)
            //    {
            //        PhotonNetwork.IsMessageQueueRunning = false;
            //    }
            //}
            SessionInfo.LoadScene(SessionInfo.RoomEditor);
        }
        /// <summary>
        /// Fits the camera into a custom given bounds.
        /// </summary>
        /// <param name="bounds">The bounds to fit the camera to.</param>
        public void SetCustomBounds(Bounds bounds)
        {
            _mainCamera.FitToBounds(bounds, CameraDistanceRatio);
            CameraDistance = _mainCamera.transform.position.magnitude;
            CameraPivot = bounds.center;
            Skybox.transform.localScale = bounds.size.magnitude * SkyboxScale * Vector3.one;
            InputMultiplier = bounds.size.magnitude * InputMultiplierRatio;
            CameraAngle = Vector2.zero;
        }

        /// <summary>
        /// Changes the camera placement when the Model has changed.
        /// </summary>
        protected virtual void ModelTransformChanged()
        {
            if (RootGameObject != null && _mainCamera.enabled)
            {
                var bounds = RootGameObject.CalculateBounds();
                _mainCamera.FitToBounds(bounds, CameraDistanceRatio);
                // Uncomment this code to scale up small objects
                if (bounds.size.magnitude < 1f)
                {
                    var increase = 1f / bounds.size.magnitude;
                    RootGameObject.transform.localScale *= increase;
                    bounds = RootGameObject.CalculateBounds();
                }
                CameraDistance = _mainCamera.transform.position.magnitude;
                CameraPivot = bounds.center;
                Skybox.transform.localScale = bounds.size.magnitude * SkyboxScale * Vector3.one;
                InputMultiplier = bounds.size.magnitude * InputMultiplierRatio;
                CameraAngle = Vector2.zero;
                if (GroundPlane != null)
                {
                    GroundPlane.transform.localScale = GroundPlane.transform.lossyScale * bounds.size.magnitude;
                }


            }
        }

        protected virtual void PopulateWithMeshColliders(GameObject ParentObject)
        {
            MeshRenderer[] meshRenderers = ParentObject.GetComponentsInChildren<MeshRenderer>();

            foreach (MeshRenderer meshRenderer in meshRenderers)
            {
                // Check if the GameObject already has a MeshCollider
                MeshCollider existingCollider = meshRenderer.gameObject.GetComponent<MeshCollider>();

                if (existingCollider == null)
                {
                    // Add a MeshCollider if it doesn't already exist
                    MeshCollider meshCollider = meshRenderer.gameObject.AddComponent<MeshCollider>();

                    // Set the MeshCollider's mesh to the same mesh as the MeshFilter
                    MeshFilter meshFilter = meshRenderer.GetComponent<MeshFilter>();
                    if (meshFilter != null)
                    {
                        meshCollider.sharedMesh = meshFilter.sharedMesh;
                    }
                }
            }
        }

        /// <summary>
        /// Event is triggered when any error occurs.
        /// </summary>
        /// <param name="contextualizedError">The Contextualized Error that has occurred.</param>
        protected override void OnError(IContextualizedError contextualizedError)
        {
            if (Application.GetStackTraceLogType(LogType.Exception) != StackTraceLogType.None || Application.GetStackTraceLogType(LogType.Error) != StackTraceLogType.None)
            {
                _errorPanelText.text = contextualizedError.ToString();
                _errorPanel.SetActive(true);
            }
            base.OnError(contextualizedError);
            StopAnimation();
        }

        /// <summary>Event is triggered when the Model (including Textures and Materials) has been fully loaded.</summary>
        /// <param name="assetLoaderContext">The Asset Loader Context reference. Asset Loader Context contains the Model loading data.</param>
        protected override void OnMaterialsLoad(AssetLoaderContext assetLoaderContext)
        {
            base.OnMaterialsLoad(assetLoaderContext);
            _stopwatch.Stop();
            _loadingTimeText.text = $"Loaded in: {_stopwatch.Elapsed.Minutes:00}:{_stopwatch.Elapsed.Seconds:00}";
            ModelTransformChanged();
            if (assetLoaderContext.RootGameObject != null)
            {
                _showSkeleton = assetLoaderContext.RootGameObject.AddComponent<ShowSkeleton>();
                _showSkeleton.Setup(assetLoaderContext, this);
                assetLoaderContext.Allocations.Add(_showSkeleton);
                if (assetLoaderContext.Options.LoadPointClouds && assetLoaderContext.RootGameObject != null)
                {
                    HandlePointClouds(assetLoaderContext);
                }
                var meshAllocation = 0;
                var textureAllocation = 0;
                var materialAllocation = 0;
                var animationClipAllocation = 0;
                var miscAllocation = 0;
                foreach (var allocation in assetLoaderContext.Allocations)
                {
                    var runtimeMemorySize = Profiler.GetRuntimeMemorySize(allocation);
                    if (allocation is Mesh)
                    {
                        meshAllocation += runtimeMemorySize;
                    }
                    else if (allocation is Texture)
                    {
                        textureAllocation += runtimeMemorySize;
                    }
                    else if (allocation is Material)
                    {
                        materialAllocation += runtimeMemorySize;
                    }
                    else if (allocation is AnimationClip)
                    {
                        animationClipAllocation += runtimeMemorySize;
                    }
                    else
                    {
                        miscAllocation += runtimeMemorySize;
                    }
                }
                _usedMemoryText.text = UnityEngine.Debug.isDebugBuild ? $"Used Memory:\nMeshes: {ProcessUtils.SizeSuffix(meshAllocation)}\nTextures: {ProcessUtils.SizeSuffix(textureAllocation)}\nMaterials: {ProcessUtils.SizeSuffix(materialAllocation)}\nAnimation Clips: {ProcessUtils.SizeSuffix(animationClipAllocation)}\nMisc.: {ProcessUtils.SizeSuffix(miscAllocation)}" : string.Empty;
            }
            else
            {
                _usedMemoryText.text = string.Empty;
            }
            OnDebugOptionsDropdownChanged(_debugOptionsDropdown.value);

            // SwapShadersInChildren(RootGameObject.transform);
            if (AfterLoadButtons != null)
            {
                AfterLoadButtons.SetActive(true);
            }


            // ModelTransformChanged();
            SetLayerRecursively(RootGameObject, LayerMask.NameToLayer("Ground Plane"));
            //PopulateWithMeshColliders(RootGameObject);
            RootGameObject.transform.SetParent(null);
            RootGameObject.transform.localScale = 1 * RootGameObject.transform.localScale;

            BackgroundLevelInfo bli = RootGameObject.AddComponent<BackgroundLevelInfo>();
            bli.SetBackgroundLevelInfo(urlLink);

            if (!isLoadedBefore && SessionInfo.RoomData.RoomWrapper ==null)
            {
                bli.GenerateUniqueID();
                int index = bli.BaseID.IndexOf("-");
                bli.SetName("Room " + bli.BaseID.Substring(0, index));
                bli.SpawnPosition = Vector3.zero;
                if (UserAccountManager.Instance != null)
                {
                    bli.OriginalOwnerUsername = UserAccountManager.userAccountInfo.Username;
                }
            }
            else
            {
                bli.SetOldId(SessionInfo.RoomData.RoomWrapper.SceneBaseID);
                bli.SetName(SessionInfo.RoomData.RoomWrapper.SceneName);

                bli.SpawnPosition = SessionInfo.RoomData.RoomWrapper.SpawnPosition;

                bli.OriginalOwnerUsername = SessionInfo.RoomData.RoomWrapper.OriginalOwnerUsername;
                bli.IsEntranceSet = SessionInfo.RoomData.RoomWrapper.IsEntranceSet;

                MoveEntranceToTheCurrentValues.Raise();
            }



            UpdateRoomNameUI(bli.SceneName);
            if (NextButton != null)
            {
                NextButton.gameObject.SetActive(true);
            }

            SwapShaderOfRootGameObject(0);


            if (IsAddSpawnPlace)
            {
                _spawnPlace = Instantiate(SpawningPlacePrefab, bli.SpawnPosition, quaternion.identity).transform;
                if (SessionInfo.RoomData != null && SessionInfo.RoomData.RoomWrapper != null)
                {
                    SetSpwanPlace(SessionInfo.RoomData.RoomWrapper.SpawnPosition, SessionInfo.RoomData.RoomWrapper.SpawnDirection);
                    bli.SpawnPosition = SessionInfo.RoomData.RoomWrapper.SpawnPosition;
                    bli.SpawnDirection = SessionInfo.RoomData.RoomWrapper.SpawnDirection;
                }
            }

            if (bli.IsEnternaceSet())
            {
                bli.EntrancePosition = SessionInfo.RoomData.RoomWrapper.EntrancePosition;
                bli.EntranceDirection = SessionInfo.RoomData.RoomWrapper.EntranceDirection;
                //bli.IsEntranceSet = 
                EntrancePosition.Value = bli.EntrancePosition;
                EntranceDirection.Value = bli.EntranceDirection;
                IsEntranceSet.Value = true;
                MoveEntranceToTheCurrentValues.Raise();



            }
            else
            {
                ShowMessegeToAssignNewEntrance.Raise(true);
            }


        }

        public void UpdateRoomNameUI(string newName)
        {
            if (TMP_RoomName != null)
            {
                TMP_RoomName.text = newName;
            }
            BackgroundLevelInfo.instance.SetName(newName);
        }
        /// <summary>
        /// Event triggered when the user changes the debug options dropdown value.
        /// </summary>
        /// <param name="value">The dropdown value.</param>
        public void SwapShaderOfRootGameObject(Int32 value)
        {
            // if()
            var unlitShader = Shader.Find("Unlit/Texture");
            var litShader = Shader.Find("Standard");



            if (value == 0)
            {
                if (BackgroundLevelInfo.instance != null)
                {
                    BackgroundLevelInfo.instance.IsLitEngine = false;
                }
                SwapShadersInChildren(RootGameObject.transform, unlitShader);
            }
            else if (value == 1)
            {
                if (BackgroundLevelInfo.instance != null)
                {
                    BackgroundLevelInfo.instance.IsLitEngine = true;
                }
                SwapShadersInChildren(RootGameObject.transform, litShader);
            }
        }
        void SwapShadersInChildren(Transform parent, Shader ToChange)
        {

            // Get the Renderer component of the current object
            Renderer renderer = parent.GetComponent<Renderer>();
            if (renderer != null)
            {
                // Loop through all the materials of the renderer
                foreach (Material mat in renderer.materials)
                {
                    // Swap the shader to unlit
                    mat.shader = ToChange;
                }
            }

            // Recursively apply to all children
            foreach (Transform child in parent)
            {
                SwapShadersInChildren(child, ToChange);
            }
        }

        /// <summary>Handles Point Clouds rendering.</summary>
        /// <param name="assetLoaderContext">The Asset Loader Context reference. Asset Loader Context contains the Model loading data.</param>
        private void HandlePointClouds(AssetLoaderContext assetLoaderContext)
        {
            foreach (var gameObject in assetLoaderContext.GameObjects.Values)
            {
                if (gameObject.TryGetComponent<MeshFilter>(out var meshFilter))
                {
                    var pointRenderer = gameObject.AddComponent<PointRenderer>();
                    pointRenderer.PointSize = _pointSizeSlider.value;
                    pointRenderer.Initialize(meshFilter.sharedMesh);
                    assetLoaderContext.Allocations.Add(pointRenderer.Mesh);
                    assetLoaderContext.Allocations.Add(pointRenderer.Material);
                }
            }
        }

        public void OnNextButtonPressed()
        {
            DontDestroyOnLoad(RootGameObject);
            // if (!isLoadedBefore)
            // {
            //     BackgroundLevelInfo.instance.GenerateUniqueID();
            // }
            // else
            // {
            //     BackgroundLevelInfo.instance.SetOldId(RoomSavedManager.instance.FurnitureWrapper.SceneBaseID);
            //     BackgroundLevelInfo.instance.SetName(RoomSavedManager.instance.FurnitureWrapper.SceneName);
            // }
            //
            SetLoading(true);
            BackgroundLevelInfo.instance.SetName(TMP_RoomName.text);
            SessionInfo.LoadScene(SessionInfo.RoomEditor);
        }

        public void SetLayerRecursively(GameObject obj, int newLayer)
        {
            // Set the layer of the current GameObject
            obj.layer = newLayer;

            // Iterate through all the children of the current GameObject
            foreach (Transform child in obj.transform)
            {
                // Recursively set the layer of each child
                SetLayerRecursively(child.gameObject, newLayer);
            }
        }

        public void Ui_OnSetSpawnPositionButtonPressed()
        {
            SpwanPanel.SetActive(true);
            MouseWorldAssetUploader.instance.gameObject.SetActive(true);
            IsShoosingSpawnPlace = true;
        }
        public void Ui_OnSetSpawnCancelButtonPressed()
        {
            SpwanPanel.SetActive(false);
            MouseWorldAssetUploader.instance.gameObject.SetActive(false);
            IsShoosingSpawnPlace = false;
        }

        public void SetSpwanPlaceUsingMouse()
        {
            if (MouseWorldAssetUploader.instance == null) { return; }
            if (MouseWorldAssetUploader.instance.CurSurfaceType != SurfaceType.Ground)
            {
                return;
            }
            if (_spawnPlace == null) { return; }
            Vector3 p = MouseWorldAssetUploader.instance.transform.position;
            _spawnPlace.position = p;
            BackgroundLevelInfo.instance.SpawnPosition = _spawnPlace.position;
            if (isLoadedBefore)
            {
                var fw = SessionInfo.RoomData.RoomWrapper;
                fw.SpawnPosition = _spawnPlace.position;
                UserAccountManager.Instance.SetUserData("RoomDesign_" + fw.SceneBaseID, fw.ConvertToJSON());
            }
            StartCoroutine(SetChosingSpawnerDirectionPhaseAfterDelay(0.25f));

            IsShoosingSpawnPlace = false;
        }
        IEnumerator SetChosingSpawnerDirectionPhaseAfterDelay(float delay)
        {
            yield return new WaitForSeconds(delay);
            IsChosingSpawnerDirectionPhase.Value = true;
            Debug.Log("Boolean set to true after " + delay + " seconds.");
        }
        public void SetSpwanDirectionUsingMouse()
        {

            if (MouseWorldAssetUploader.instance == null) { return; }
            if (MouseWorldAssetUploader.instance.CurSurfaceType != SurfaceType.Ground)
            {
                return;
            }
            if (_spawnPlace == null) { return; }
            BackgroundLevelInfo.instance.SpawnDirection = SpawnerDirection.Value;
            if (isLoadedBefore)
            {
                var fw = SessionInfo.RoomData.RoomWrapper;
                fw.SpawnDirection = SpawnerDirection.Value;
                UserAccountManager.Instance.SetUserData("RoomDesign_" + fw.SceneBaseID, fw.ConvertToJSON());
            }
            IsChosingSpawnerDirectionPhase.Value = false;
        }

        public void SetSpwanPlace(Vector3 spwanPlace,Vector3 spawnRotation = new Vector3(), bool SaveOnline = false)
        {


            _spawnPlace.position = spwanPlace;
            _spawnPlace.rotation = Quaternion.Euler(spawnRotation);
            BackgroundLevelInfo.instance.SpawnPosition = _spawnPlace.position;
            BackgroundLevelInfo.instance.SpawnDirection = spawnRotation;
            if (isLoadedBefore && SaveOnline)
            {

                //var fw = RoomSavedManager.instance.FurnitureWrapper;
                var fw = SessionInfo.RoomData.RoomWrapper;
                BackgroundLevelInfo.instance.SpawnPosition = _spawnPlace.position;
                BackgroundLevelInfo.instance.SpawnDirection = _spawnPlace.rotation.eulerAngles;
                UserAccountManager.Instance.SetUserData("RoomDesign_" + fw.SceneBaseID, fw.ConvertToJSON());
            }
            Ui_OnSetSpawnCancelButtonPressed();
        }


    }
}
