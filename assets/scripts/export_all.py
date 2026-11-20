#!/usr/bin/env python3
"""
Headless Blender 5.x script to generate and export low-poly stylized 3D assets:
1. office_kit.glb (8 role zones, desks, whiteboard, kanban wall, QA device wall, server rack, meeting table, lounge, director desk)
2. character_base.glb (low-poly character hierarchy with 11 named animation clips:
   Idle, Walk, Walk_Carry, Sit_Idle, Sit_Type, Read, Type_Standing, Raise_Hand, Cheer, Defeated, Drink)

Usage:
  blender --background --python assets/scripts/export_all.py
"""

import bpy
import math
import os
import shutil

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
OUT_DIR = os.path.join(ROOT_DIR, "assets", "out")
WEB_MODELS_DIR = os.path.join(ROOT_DIR, "apps", "web", "public", "models")

os.makedirs(OUT_DIR, exist_ok=True)
os.makedirs(WEB_MODELS_DIR, exist_ok=True)


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def make_material(name, rgba, metallic=0.1, roughness=0.6, emission=None):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = rgba
        bsdf.inputs["Metallic"].default_value = metallic
        bsdf.inputs["Roughness"].default_value = roughness
        if emission and "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = emission
            bsdf.inputs["Emission Strength"].default_value = 1.5
    return mat


def add_box(name, size, location, material, parent=None):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (size[0], size[1], size[2])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if obj.data.materials:
        obj.data.materials[0] = material
    else:
        obj.data.materials.append(material)
    if parent:
        obj.parent = parent
    return obj


def build_office_kit():
    clear_scene()

    mat_floor = make_material("FloorMat", (0.14, 0.16, 0.22, 1.0), roughness=0.8)
    mat_wall = make_material("WallMat", (0.20, 0.23, 0.30, 1.0), roughness=0.7)
    mat_desk = make_material("DeskMat", (0.28, 0.31, 0.40, 1.0), roughness=0.5)
    mat_screen = make_material(
        "ScreenMat",
        (0.10, 0.75, 0.95, 1.0),
        roughness=0.2,
        emission=(0.10, 0.75, 0.95, 1.0),
    )
    mat_whiteboard = make_material("BoardMat", (0.92, 0.94, 0.97, 1.0), roughness=0.3)
    mat_rack = make_material("RackMat", (0.10, 0.12, 0.16, 1.0), metallic=0.7, roughness=0.3)
    mat_accent = make_material("AccentMat", (0.39, 0.40, 0.95, 1.0), roughness=0.4)

    # Main floor & low perimeter walls
    add_box("Office_Floor", (24.0, 18.0, 0.2), (0.0, 0.0, -0.1), mat_floor)
    add_box("Wall_North", (24.0, 0.3, 2.6), (0.0, -9.0, 1.3), mat_wall)
    add_box("Wall_West", (0.3, 18.0, 2.6), (-12.0, 0.0, 1.3), mat_wall)
    add_box("Wall_East", (0.3, 18.0, 2.6), (12.0, 0.0, 1.3), mat_wall)

    # Kanban Wall & Planning Whiteboard on North Wall
    add_box("Kanban_Wall", (6.5, 0.15, 1.8), (0.0, -8.75, 1.4), mat_whiteboard)
    add_box("Whiteboard_PM", (3.6, 0.15, 1.6), (-5.5, -8.75, 1.4), mat_whiteboard)

    # QA Device Wall & DevOps Server Rack
    add_box("Device_Wall_QA", (3.2, 0.25, 1.7), (5.5, -8.7, 1.35), mat_screen)
    add_box("Server_Rack_DevOps", (1.4, 1.2, 2.2), (9.8, -6.8, 1.1), mat_rack)

    # Meeting Room Table & Lounge Coffee Bar
    add_box("Meeting_Table", (3.4, 1.8, 0.75), (0.0, 1.5, 0.375), mat_desk)
    add_box("Coffee_Bar_Lounge", (2.8, 1.0, 0.9), (-9.2, 6.2, 0.45), mat_accent)
    add_box("Director_Desk", (2.4, 1.1, 0.78), (0.0, 7.2, 0.39), mat_accent)

    # 8 Role Desks
    role_desks = [
        ("Desk_em", (-8.5, -5.5)),
        ("Desk_pm", (-5.5, -5.5)),
        ("Desk_tl", (-2.5, -5.5)),
        ("Desk_fe", (-5.5, -0.8)),
        ("Desk_be", (-2.5, -0.8)),
        ("Desk_qa", (5.5, -5.5)),
        ("Desk_reviewer", (4.5, -0.8)),
        ("Desk_devops", (8.5, -3.5)),
    ]
    for name, (x, y) in role_desks:
        add_box(name, (1.8, 0.9, 0.74), (x, y, 0.37), mat_desk)
        add_box(f"{name}_Monitor", (0.7, 0.08, 0.42), (x, y - 0.25, 0.95), mat_screen)

    out_path = os.path.join(OUT_DIR, "office_kit.glb")
    bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format="GLB",
        export_apply=True,
        export_lights=False,
        export_cameras=False,
    )
    shutil.copy2(out_path, os.path.join(WEB_MODELS_DIR, "office_kit.glb"))
    print(f"Exported {out_path}")


def build_character_base():
    clear_scene()
    scene = bpy.context.scene
    scene.render.fps = 24

    mat_body = make_material("AgentBodyMat", (0.38, 0.42, 0.95, 1.0), roughness=0.45)
    mat_head = make_material("AgentHeadMat", (0.94, 0.82, 0.72, 1.0), roughness=0.5)
    mat_dark = make_material("AgentLimbMat", (0.18, 0.20, 0.28, 1.0), roughness=0.6)
    mat_prop = make_material("AgentFolderMat", (0.96, 0.75, 0.22, 1.0), roughness=0.4)

    bpy.ops.object.empty_add(type="PLAIN_AXES", location=(0, 0, 0))
    root = bpy.context.active_object
    root.name = "AgentRoot"

    hips = add_box("Hips", (0.42, 0.26, 0.22), (0, 0, 0.65), mat_dark, parent=root)
    torso = add_box("Torso", (0.46, 0.28, 0.52), (0, 0, 0.38), mat_body, parent=hips)
    head = add_box("Head", (0.34, 0.32, 0.34), (0, 0, 0.46), mat_head, parent=torso)
    arm_l = add_box("Arm_L", (0.14, 0.14, 0.44), (-0.34, 0, 0.12), mat_body, parent=torso)
    arm_r = add_box("Arm_R", (0.14, 0.14, 0.44), (0.34, 0, 0.12), mat_body, parent=torso)
    leg_l = add_box("Leg_L", (0.16, 0.16, 0.52), (-0.13, 0, -0.34), mat_dark, parent=hips)
    leg_r = add_box("Leg_R", (0.16, 0.16, 0.52), (0.13, 0, -0.34), mat_dark, parent=hips)
    folder = add_box("Carry_Folder", (0.24, 0.05, 0.18), (0.0, -0.22, -0.14), mat_prop, parent=arm_r)

    clips = [
        "Idle",
        "Walk",
        "Walk_Carry",
        "Sit_Idle",
        "Sit_Type",
        "Read",
        "Type_Standing",
        "Raise_Hand",
        "Cheer",
        "Defeated",
        "Drink",
    ]

    hips.animation_data_create()

    for clip_name in clips:
        action = bpy.data.actions.new(name=clip_name)
        hips.animation_data.action = action

        for frame_idx, f in enumerate([1, 12, 24]):
            phase = (frame_idx / 2.0) * math.pi * 2.0
            s = math.sin(phase) if frame_idx == 1 else 0.0

            hips.location = (0.0, 0.0, 0.65)
            hips.rotation_euler = (0.0, 0.0, 0.0)

            if clip_name == "Idle":
                hips.location.z = 0.65 + (0.03 if frame_idx == 1 else 0.0)
            elif clip_name in ("Walk", "Walk_Carry"):
                hips.location.z = 0.65 + (0.06 if frame_idx == 1 else 0.0)
                hips.rotation_euler.z = 0.12 if frame_idx == 1 else -0.12 if frame_idx == 0 else 0.12
            elif clip_name in ("Sit_Idle", "Sit_Type"):
                hips.location.z = 0.48 + (0.02 if frame_idx == 1 else 0.0)
            elif clip_name == "Read":
                hips.rotation_euler.x = 0.18 if frame_idx == 1 else 0.10
            elif clip_name == "Type_Standing":
                hips.location.z = 0.65 + (0.02 if frame_idx == 1 else 0.0)
                hips.rotation_euler.z = 0.06 if frame_idx == 1 else -0.06
            elif clip_name == "Raise_Hand":
                hips.location.z = 0.68 if frame_idx == 1 else 0.65
                hips.rotation_euler.y = 0.10 if frame_idx == 1 else 0.0
            elif clip_name == "Cheer":
                hips.location.z = 0.82 if frame_idx == 1 else 0.65
            elif clip_name == "Defeated":
                hips.location.z = 0.56 if frame_idx == 1 else 0.60
                hips.rotation_euler.x = 0.30
            elif clip_name == "Drink":
                hips.rotation_euler.x = -0.15 if frame_idx == 1 else 0.0

            hips.keyframe_insert(data_path="location", frame=f)
            hips.keyframe_insert(data_path="rotation_euler", frame=f)

        track = hips.animation_data.nla_tracks.new()
        track.name = clip_name
        strip = track.strips.new(clip_name, 1, action)
        strip.name = clip_name

    hips.animation_data.action = None

    out_path = os.path.join(OUT_DIR, "character_base.glb")
    bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format="GLB",
        export_apply=True,
        export_animations=True,
        export_animation_mode="NLA_TRACKS",
        export_lights=False,
        export_cameras=False,
    )
    shutil.copy2(out_path, os.path.join(WEB_MODELS_DIR, "character_base.glb"))
    print(f"Exported {out_path}")


if __name__ == "__main__":
    build_office_kit()
    build_character_base()
    print("All Blender GLB assets exported successfully!")
