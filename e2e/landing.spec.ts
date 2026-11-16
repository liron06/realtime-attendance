import {test,expect} from "@playwright/test";
test("landingspagina is Nederlandstalig en responsive",async({page})=>{await page.goto("/");await expect(page.getByRole("heading",{name:/Jouw QR/})).toBeVisible();await expect(page.getByRole("link",{name:"Inloggen met Congressus"})).toBeVisible()});
