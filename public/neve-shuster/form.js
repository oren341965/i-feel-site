document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-resident-quote]').forEach((form) => {
    const building = form.querySelector('[name="building"]');
    const buildingSelect = form.querySelector('[data-building-select]');
    const apartment = form.querySelector('[name="apartment"]');
    const apartmentInput = form.querySelector('[data-apartment-input]');
    const apartmentType = form.querySelector('[data-apartment-type]');
    const status = document.querySelector('[data-proposal-status]');

    const syncBuilding = () => {
      const hasBuilding = Boolean(building && building.value.trim());
      if (apartmentInput) apartmentInput.disabled = !hasBuilding;
      if (apartmentType) apartmentType.disabled = !hasBuilding;
    };

    const syncProposalStatus = () => {
      if (!status || !building || !apartment) return;
      const buildingValue = building.value.trim();
      const apartmentValue = apartment.value.trim();
      const apartmentTypeValue = apartmentType ? apartmentType.value.trim() : '';
      if (!buildingValue || !apartmentValue) {
        status.textContent = 'בחרו בניין ומספר דירה כדי שנוכל להתאים את ההצעה הנכונה לשינויי הדיירים.';
        return;
      }
      status.textContent = `בניין ${buildingValue}, דירה ${apartmentValue}${apartmentTypeValue ? `, טיפוס ${apartmentTypeValue}` : ''}: הפרטים זוהו ויצורפו לבקשה כדי להתאים את הצעת שינויי הדיירים הנכונה.`;
    };

    if (buildingSelect) buildingSelect.addEventListener('change', syncBuilding);
    [building, apartment, apartmentType].filter(Boolean).forEach((field) => {
      field.addEventListener('change', syncProposalStatus);
      field.addEventListener('input', syncProposalStatus);
    });
    syncBuilding();
    syncProposalStatus();
  });
});
