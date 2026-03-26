/*
  MODIFICATION :
  Calcul des catégories OFFICIELLES selon ton barème :

  - >= 60 : Vétéran
  - 17–18 : Junior
  - 15–16 : Cadet
  - 13–14 : Minime
  - 11–12 : Benjamin
  - 7–10  : Poussin
  - < 7   : —
  - sinon : Sénior
*/

export function calculateAgeFromBirthDate(dateNaissance) {
  if (!dateNaissance) {
    return null;
  }

  const birthDate = new Date(dateNaissance);

  if (Number.isNaN(birthDate.getTime())) {
    return null;
  }

  const today = new Date();

  let age = today.getFullYear() - birthDate.getFullYear();

  const monthDiff = today.getMonth() - birthDate.getMonth();
  const dayDiff = today.getDate() - birthDate.getDate();

  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1;
  }

  return age >= 0 ? age : null;
}

export function getCategoryFromBirthDate(dateNaissance) {
  const age = calculateAgeFromBirthDate(dateNaissance);

  if (age === null) {
    return "";
  }

  if (age >= 60) {
    return "Vétéran";
  }

  if (age >= 17 && age <= 18) {
    return "Junior";
  }

  if (age >= 15 && age <= 16) {
    return "Cadet";
  }

  if (age >= 13 && age <= 14) {
    return "Minime";
  }

  if (age >= 11 && age <= 12) {
    return "Benjamin";
  }

  if (age >= 7 && age <= 10) {
    return "Poussin";
  }

  if (age < 7) {
    return "—";
  }

  return "Sénior";
}