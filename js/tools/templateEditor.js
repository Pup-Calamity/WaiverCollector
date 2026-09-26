// js/tools/templateEditor.js

export function getPdfJsLib() {
    return window['pdfjs-dist/build/pdf'];
}

export function redrawCanvas(canvas, bgCanvas, viewport, map, selectedItem = null, currentPageNum = 1) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (bgCanvas) ctx.drawImage(bgCanvas, 0, 0);

    const drawBox = (px, py, pw, ph, color, isSelected) => {
        ctx.fillStyle = color.fill;
        ctx.strokeStyle = isSelected ? '#ffeb3b' : color.stroke; 
        ctx.lineWidth = isSelected ? 3 : 2;
        ctx.fillRect(px, py, pw, ph);
        ctx.strokeRect(px, py, pw, ph);
        ctx.fillStyle = isSelected ? '#ffeb3b' : color.stroke;
        ctx.fillRect(px + pw - 8, py + ph - 8, 8, 8);
    };

    if (map.coverUps) {
        map.coverUps.forEach((box, index) => {
            const itemPage = box.page || 1; 
            if (itemPage !== currentPageNum) return; 

            const px = box.x * viewport.scale;
            const ph = box.height * viewport.scale;
            const py = viewport.height - (box.y * viewport.scale) - ph;
            const pw = box.width * viewport.scale;
            const isSelected = selectedItem && selectedItem.type === 'coverup' && selectedItem.id === index;
            drawBox(px, py, pw, ph, { fill: 'rgba(255, 255, 255, 0.8)', stroke: '#dc3545' }, isSelected);
        });
    }

    if (map.fields) {
        map.fields.forEach((field, index) => {
            const itemPage = field.page || 1;
            if (itemPage !== currentPageNum) return; 

            const px = field.x * viewport.scale;
            const ph = (field.height || 15) * viewport.scale;
            const py = viewport.height - (field.y * viewport.scale) - ph;
            const pw = (field.width || 60) * viewport.scale;

            const isSelected = selectedItem && selectedItem.type === 'variable' && selectedItem.id === index;
            drawBox(px, py, pw, ph, { fill: 'rgba(74, 246, 38, 0.3)', stroke: '#4af626' }, isSelected);
            
            ctx.fillStyle = '#000';
            ctx.font = 'bold 12px Arial';
            ctx.fillText(field.variable, px + 4, py + 16);
        });
    }

    if (map.staticTexts) {
        map.staticTexts.forEach((st, index) => {
            const itemPage = st.page || 1;
            if (itemPage !== currentPageNum) return;

            const px = st.x * viewport.scale;
            const ph = (st.height || 15) * viewport.scale;
            const py = viewport.height - (st.y * viewport.scale) - ph;
            const pw = (st.width || 60) * viewport.scale;

            const isSelected = selectedItem && selectedItem.type === 'staticText' && selectedItem.id === index;
            drawBox(px, py, pw, ph, { fill: 'rgba(38, 138, 246, 0.3)', stroke: '#268af6' }, isSelected);
            
            ctx.fillStyle = '#000';
            ctx.font = 'bold 12px Arial';
            ctx.fillText(`Text: "${st.text}"`, px + 4, py + 16);
        });
    }
}

export function getHoveredItem(mouseX, mouseY, viewport, map, currentPageNum = 1) {
    const checkHit = (x, y, w, h) => {
        const px = x * viewport.scale;
        const ph = h * viewport.scale;
        const py = viewport.height - (y * viewport.scale) - ph;
        const pw = w * viewport.scale;

        if (mouseX >= px + pw - 12 && mouseX <= px + pw + 5 && mouseY >= py + ph - 12 && mouseY <= py + ph + 5) return 'resize';
        if (mouseX >= px && mouseX <= px + pw && mouseY >= py && mouseY <= py + ph) return 'move';
        return null;
    };

    if (map.fields) {
        // Loop backward to prioritize clicking the box drawn most recently (top Z-index)
        for (let i = map.fields.length - 1; i >= 0; i--) {
            const field = map.fields[i];
            if ((field.page || 1) !== currentPageNum) continue;
            const action = checkHit(field.x, field.y, field.width || 60, field.height || 15);
            if (action) return { type: 'variable', id: i, action };
        }
    }

    if (map.coverUps) {
        for (let i = map.coverUps.length - 1; i >= 0; i--) {
            const box = map.coverUps[i];
            if ((box.page || 1) !== currentPageNum) continue;
            const action = checkHit(box.x, box.y, box.width, box.height);
            if (action) return { type: 'coverup', id: i, action };
        }
    }

    if (map.staticTexts) {
        map.staticTexts.forEach((st, index) => {
            const itemPage = st.page || 1;
            if (itemPage !== currentPageNum) return;

            const px = st.x * viewport.scale;
            const ph = (st.height || 15) * viewport.scale;
            const py = viewport.height - (st.y * viewport.scale) - ph;
            const pw = (st.width || 60) * viewport.scale;

            const isSelected = selectedItem && selectedItem.type === 'staticText' && selectedItem.id === index;
            drawBox(px, py, pw, ph, { fill: 'rgba(38, 138, 246, 0.3)', stroke: '#268af6' }, isSelected);
            
            ctx.fillStyle = '#000';
            ctx.font = 'bold 12px Arial';
            ctx.fillText(`Text: "${st.text}"`, px + 4, py + 16);
        });
    }
    return null;
}
