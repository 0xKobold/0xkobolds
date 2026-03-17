/**
 * VRM-Mixamo Animation Retargeter
 * Converts Mixamo FBX animations to VRM-compatible format
 * Based on @pixiv/three-vrm retargeting formula
 */

import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRM } from '@pixiv/three-vrm';

// Bone mapping: Mixamo -> VRM
const BONE_MAPPING: Record<string, string> = {
  'mixamorigHips': 'hips',
  'mixamorigSpine': 'spine',
  'mixamorigSpine1': 'chest',
  'mixamorigSpine2': 'upperChest',
  'mixamorigNeck': 'neck',
  'mixamorigHead': 'head',
  'mixamorigLeftShoulder': 'leftShoulder',
  'mixamorigLeftArm': 'leftUpperArm',
  'mixamorigLeftForeArm': 'leftLowerArm',
  'mixamorigLeftHand': 'leftHand',
  'mixamorigRightShoulder': 'rightShoulder',
  'mixamorigRightArm': 'rightUpperArm',
  'mixamorigRightForeArm': 'rightLowerArm',
  'mixamorigRightHand': 'rightHand',
  'mixamorigLeftUpLeg': 'leftUpperLeg',
  'mixamorigLeftLeg': 'leftLowerLeg',
  'mixamorigLeftFoot': 'leftFoot',
  'mixamorigLeftToeBase': 'leftToes',
  'mixamorigRightUpLeg': 'rightUpperLeg',
  'mixamorigRightLeg': 'rightLowerLeg',
  'mixamorigRightFoot': 'rightFoot',
  'mixamorigRightToeBase': 'rightToes',
  // Fingers (optional)
  'mixamorigLeftHandThumb1': 'leftThumbProximal',
  'mixamorigLeftHandThumb2': 'leftThumbDistal',
  'mixamorigLeftHandIndex1': 'leftIndexProximal',
  'mixamorigLeftHandIndex2': 'leftIndexDistal',
  'mixamorigLeftHandMiddle1': 'leftMiddleProximal',
  'mixamorigLeftHandMiddle2': 'leftMiddleDistal',
  'mixamorigLeftHandRing1': 'leftRingProximal',
  'mixamorigLeftHandRing2': 'leftRingDistal',
  'mixamorigLeftHandPinky1': 'leftLittleProximal',
  'mixamorigLeftHandPinky2': 'leftLittleDistal',
  'mixamorigRightHandThumb1': 'rightThumbProximal',
  'mixamorigRightHandThumb2': 'rightThumbDistal',
  'mixamorigRightHandIndex1': 'rightIndexProximal',
  'mixamorigRightHandIndex2': 'rightIndexDistal',
  'mixamorigRightHandMiddle1': 'rightMiddleProximal',
  'mixamorigRightHandMiddle2': 'rightMiddleDistal',
  'mixamorigRightHandRing1': 'rightRingProximal',
  'mixamorigRightHandRing2': 'rightRingDistal',
  'mixamorigRightHandPinky1': 'rightLittleProximal',
  'mixamorigRightHandPinky2': 'rightLittleDistal',
};

export interface RetargetOptions {
  heightScale?: 'auto' | number;
  preservePosition?: boolean;
  boneMapping?: Record<string, string>;
}

/**
 * Retarget Mixamo FBX animation to VRM
 * 
 * Formula from @pixiv/three-vrm:
 * rotation = parentRestWorldRot * animQ * inv(boneRestWorldRot)
 * position = position * (vrmHipsHeight / mixamoHipsHeight)
 */
export function retargetMixamoAnimation(
  fbx: THREE.Group,
  vrm: VRM,
  options: RetargetOptions = {}
): THREE.AnimationClip {
  const {
    heightScale = 'auto',
    preservePosition = true,
    boneMapping = BONE_MAPPING,
  } = options;

  // Get animation clips from FBX
  const clips = THREE.AnimationClip.parseAnimationClips(fbx.animations);
  if (clips.length === 0) {
    throw new Error('No animation clips found in FBX');
  }

  const sourceClip = clips[0];
  const tracks: THREE.KeyframeTrack[] = [];

  // Calculate height scale
  let scale = typeof heightScale === 'number' ? heightScale : 1;
  
  if (heightScale === 'auto') {
    // Find hips height in both models
    const mixamoHips = fbx.getObjectByName('mixamorigHips');
    const vrmHips = vrm.humanoid.getNormalizedBoneNode('hips');
    
    if (mixamoHips && vrmHips) {
      const mixamoHeight = mixamoHips.position.y;
      const vrmHeight = vrmHips.getWorldPosition(new THREE.Vector3()).y;
      scale = vrmHeight / mixamoHeight;
    }
  }

  // Process each track
  for (const track of sourceClip.tracks) {
    const trackName = track.name;
    
    // Extract bone name from track name (e.g., "mixamorigHips.position")
    const match = trackName.match(/^(.+)\.(position|quaternion|scale)$/);
    if (!match) continue;
    
    const [, boneName, property] = match;
    const vrmBoneName = boneMapping[boneName];
    
    if (!vrmBoneName) continue;
    
    // Get VRM bone
    const vrmBone = vrm.humanoid.getNormalizedBoneNode(vrmBoneName as any);
    if (!vrmBone) continue;
    
    // Get rest pose
    const restWorldQuat = new THREE.Quaternion();
    const restWorldPos = new THREE.Vector3();
    vrmBone.getWorldQuaternion(restWorldQuat);
    vrmBone.getWorldPosition(restWorldPos);
    
    // Get parent rest pose
    const parentRestWorldQuat = new THREE.Quaternion();
    if (vrmBone.parent) {
      vrmBone.parent.getWorldQuaternion(parentRestWorldQuat);
    }
    
    if (property === 'quaternion') {
      // Retarget rotation
      const quaTrack = track as THREE.QuaternionKeyframeTrack;
      const times = quaTrack.times;
      const values = quaTrack.values;
      const newValues = new Float32Array(values.length);
      
      for (let i = 0; i < times.length; i++) {
        const animQuat = new THREE.Quaternion(
          values[i * 4],
          values[i * 4 + 1],
          values[i * 4 + 2],
          values[i * 4 + 3]
        );
        
        // Apply retargeting formula:
        // rotation = parentRestWorldRot * animQ * inv(boneRestWorldRot)
        const retargetedQuat = parentRestWorldQuat.clone()
          .multiply(animQuat)
          .multiply(restWorldQuat.clone().invert());
        
        newValues[i * 4] = retargetedQuat.x;
        newValues[i * 4 + 1] = retargetedQuat.y;
        newValues[i * 4 + 2] = retargetedQuat.z;
        newValues[i * 4 + 3] = retargetedQuat.w;
      }
      
      tracks.push(new THREE.QuaternionKeyframeTrack(
        `${vrmBone.name}.quaternion`,
        times,
        newValues
      ));
    } else if (property === 'position' && boneName === 'mixamorigHips') {
      // Only retarget hips position (rest are local)
      const posTrack = track as THREE.VectorKeyframeTrack;
      const times = posTrack.times;
      const values = posTrack.values;
      const newValues = new Float32Array(values.length);
      
      for (let i = 0; i < times.length; i++) {
        // Scale position
        newValues[i * 3] = values[i * 3] * scale;
        newValues[i * 3 + 1] = values[i * 3 + 1] * scale;
        newValues[i * 3 + 2] = values[i * 3 + 2] * scale;
        
        // Optionally lock to in-place
        if (preservePosition) {
          // Keep X and Z at 0, only allow Y (height)
          newValues[i * 3] = 0; // X
          newValues[i * 3 + 2] = 0; // Z
        }
      }
      
      tracks.push(new THREE.VectorKeyframeTrack(
        `${vrmBone.name}.position`,
        times,
        newValues
      ));
    }
  }

  return new THREE.AnimationClip(
    sourceClip.name || 'retargeted',
    sourceClip.duration,
    tracks
  );
}

/**
 * Load VRM avatar from URL
 */
export async function loadVRM(url: string): Promise<VRM> {
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));
  
  const gltf = await loader.loadAsync(url);
  return gltf.userData.vrm;
}

/**
 * Load Mixamo FBX animation from URL
 */
export async function loadMixamoFBX(url: string): Promise<THREE.Group> {
  const loader = new FBXLoader();
  return await loader.loadAsync(url);
}

/**
 * Animation state machine for desktop pet
 */
export class DesktopPetAnimator {
  private vrm: VRM;
  private mixer: THREE.AnimationMixer;
  private actions: Map<string, THREE.AnimationAction> = new Map();
  private currentState: string = 'idle';
  private currentAction: THREE.AnimationAction | null = null;
  
  constructor(vrm: VRM) {
    this.vrm = vrm;
    this.mixer = new THREE.AnimationMixer(vrm.scene);
  }
  
  /**
   * Add animation clip for a state
   */
  addAnimation(state: string, clip: THREE.AnimationClip): void {
    const action = this.mixer.clipAction(clip);
    this.actions.set(state, action);
  }
  
  /**
   * Transition to a new state
   */
  async setState(state: string, duration: number = 0.5): Promise<void> {
    if (state === this.currentState) return;
    
    const newAction = this.actions.get(state);
    if (!newAction) {
      console.warn(`Animation state '${state}' not found`);
      return;
    }
    
    const oldAction = this.currentAction;
    this.currentState = state;
    this.currentAction = newAction;
    
    // Cross-fade transition
    newAction.reset();
    newAction.play();
    
    if (oldAction) {
      newAction.crossFadeFrom(oldAction, duration, true);
    }
    
    // Wait for transition
    await new Promise(resolve => setTimeout(resolve, duration * 1000));
  }
  
  /**
   * Update animation
   */
  update(deltaTime: number): void {
    this.mixer.update(deltaTime);
  }
  
  /**
   * Get current state
   */
  getState(): string {
    return this.currentState;
  }
}

// Export types
export type { VRM } from '@pixiv/three-vrm';