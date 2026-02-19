(function () {
  'use strict';

  window.initThreeBg = function (canvasId, mode) {
    var canvas = document.getElementById(canvasId);
    if (!canvas || typeof THREE === 'undefined') return;

    var isHero = mode === 'hero';
    var particleCount = isHero ? 140 : 60;
    var connectionDist = isHero ? 120 : 100;
    var width = window.innerWidth;
    var height = window.innerHeight;
    var mouseX = 0, mouseY = 0;

    var renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(60, width / height, 1, 2000);
    camera.position.z = 400;

    var purple = new THREE.Color(0x7c3aed);
    var cyan = new THREE.Color(0x06b6d4);

    /* ── Particles ── */
    var positions = new Float32Array(particleCount * 3);
    var velocities = [];
    var pColors = new Float32Array(particleCount * 3);

    for (var i = 0; i < particleCount; i++) {
      positions[i * 3]     = (Math.random() - 0.5) * 800;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 800;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 400;
      velocities.push(
        (Math.random() - 0.5) * 0.25,
        (Math.random() - 0.5) * 0.25,
        (Math.random() - 0.5) * 0.08
      );
      var t = Math.random();
      var c = purple.clone().lerp(cyan, t);
      pColors[i * 3] = c.r;
      pColors[i * 3 + 1] = c.g;
      pColors[i * 3 + 2] = c.b;
    }

    var pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    pGeo.setAttribute('color', new THREE.BufferAttribute(pColors, 3));

    /* soft glow texture */
    var tc = document.createElement('canvas');
    tc.width = 64; tc.height = 64;
    var tctx = tc.getContext('2d');
    var grad = tctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.2, 'rgba(255,255,255,0.6)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    tctx.fillStyle = grad;
    tctx.fillRect(0, 0, 64, 64);
    var tex = new THREE.CanvasTexture(tc);

    var pMat = new THREE.PointsMaterial({
      size: isHero ? 4 : 3,
      map: tex,
      vertexColors: true,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true
    });

    var pts = new THREE.Points(pGeo, pMat);
    scene.add(pts);

    /* ── Connection Lines ── */
    var maxLines = particleCount * 4;
    var lPos = new Float32Array(maxLines * 6);
    var lCol = new Float32Array(maxLines * 6);
    var lGeo = new THREE.BufferGeometry();
    lGeo.setAttribute('position', new THREE.BufferAttribute(lPos, 3));
    lGeo.setAttribute('color', new THREE.BufferAttribute(lCol, 3));
    lGeo.setDrawRange(0, 0);

    var lMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    scene.add(new THREE.LineSegments(lGeo, lMat));

    /* ── Wireframe Shapes (hero only) ── */
    var meshes = [];
    if (isHero) {
      var s1 = new THREE.Mesh(
        new THREE.IcosahedronGeometry(70, 1),
        new THREE.MeshBasicMaterial({ color: 0x7c3aed, wireframe: true, transparent: true, opacity: 0.06 })
      );
      scene.add(s1);
      meshes.push({ m: s1, rx: 0.001, ry: 0.0015, rz: 0 });

      var s2 = new THREE.Mesh(
        new THREE.OctahedronGeometry(28, 0),
        new THREE.MeshBasicMaterial({ color: 0x06b6d4, wireframe: true, transparent: true, opacity: 0.1 })
      );
      s2.position.set(200, -100, -60);
      scene.add(s2);
      meshes.push({ m: s2, rx: 0.006, ry: 0.008, rz: 0.003 });

      var s3 = new THREE.Mesh(
        new THREE.TorusGeometry(110, 1.2, 16, 80),
        new THREE.MeshBasicMaterial({ color: 0x7c3aed, wireframe: true, transparent: true, opacity: 0.035 })
      );
      s3.rotation.x = Math.PI / 3;
      scene.add(s3);
      meshes.push({ m: s3, rx: 0, ry: 0, rz: 0.0008 });

      var s4 = new THREE.Mesh(
        new THREE.DodecahedronGeometry(22, 0),
        new THREE.MeshBasicMaterial({ color: 0x06b6d4, wireframe: true, transparent: true, opacity: 0.09 })
      );
      s4.position.set(-220, 130, -80);
      scene.add(s4);
      meshes.push({ m: s4, rx: 0.004, ry: 0.005, rz: 0.002 });
    }

    /* ── Mouse ── */
    document.addEventListener('mousemove', function (e) {
      mouseX = (e.clientX / width - 0.5) * 2;
      mouseY = (e.clientY / height - 0.5) * 2;
    });

    /* ── Animation Loop ── */
    var frame = 0;
    function animate() {
      requestAnimationFrame(animate);
      frame++;

      var pos = pGeo.attributes.position.array;
      for (var i = 0; i < particleCount; i++) {
        var i3 = i * 3;
        pos[i3]     += velocities[i3];
        pos[i3 + 1] += velocities[i3 + 1];
        pos[i3 + 2] += velocities[i3 + 2];
        if (pos[i3] > 400 || pos[i3] < -400) velocities[i3] *= -1;
        if (pos[i3 + 1] > 400 || pos[i3 + 1] < -400) velocities[i3 + 1] *= -1;
        if (pos[i3 + 2] > 200 || pos[i3 + 2] < -200) velocities[i3 + 2] *= -1;
      }
      pGeo.attributes.position.needsUpdate = true;

      /* update connections every 3 frames for perf */
      if (frame % 3 === 0) {
        var li = 0;
        var lp = lGeo.attributes.position.array;
        var lc = lGeo.attributes.color.array;
        var md2 = connectionDist * connectionDist;

        for (var a = 0; a < particleCount && li < maxLines; a++) {
          for (var b = a + 1; b < particleCount && li < maxLines; b++) {
            var dx = pos[a*3] - pos[b*3];
            var dy = pos[a*3+1] - pos[b*3+1];
            var dz = pos[a*3+2] - pos[b*3+2];
            var d2 = dx*dx + dy*dy + dz*dz;
            if (d2 < md2) {
              var idx = li * 6;
              lp[idx]   = pos[a*3]; lp[idx+1] = pos[a*3+1]; lp[idx+2] = pos[a*3+2];
              lp[idx+3] = pos[b*3]; lp[idx+4] = pos[b*3+1]; lp[idx+5] = pos[b*3+2];
              var alpha = 1 - Math.sqrt(d2) / connectionDist;
              lc[idx] = 0.49*alpha; lc[idx+1] = 0.23*alpha; lc[idx+2] = 0.93*alpha;
              lc[idx+3] = 0.49*alpha; lc[idx+4] = 0.23*alpha; lc[idx+5] = 0.93*alpha;
              li++;
            }
          }
        }
        lGeo.setDrawRange(0, li * 2);
        lGeo.attributes.position.needsUpdate = true;
        lGeo.attributes.color.needsUpdate = true;
      }

      meshes.forEach(function (o) {
        o.m.rotation.x += o.rx;
        o.m.rotation.y += o.ry;
        o.m.rotation.z += o.rz;
      });
      if (isHero && meshes.length > 1) {
        meshes[1].m.position.y = -100 + Math.sin(frame * 0.01) * 18;
        if (meshes[3]) meshes[3].m.position.y = 130 + Math.cos(frame * 0.008) * 22;
      }

      camera.position.x += (mouseX * 25 - camera.position.x) * 0.015;
      camera.position.y += (-mouseY * 25 - camera.position.y) * 0.015;
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
    }
    animate();

    window.addEventListener('resize', function () {
      width = window.innerWidth;
      height = window.innerHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    });
  };
})();
