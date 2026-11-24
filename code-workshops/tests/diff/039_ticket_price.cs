using System;

class Program
{
    static void Main()
    {
        int age = int.Parse(Console.ReadLine());
        int price;
        if (age < 0 || age > 120) { Console.WriteLine("גיל לא תקין"); }
        else
        {
            if (age < 3) price = 0;
            else if (age < 18) price = 30;
            else if (age < 65) price = 55;
            else price = 25;
            Console.WriteLine("מחיר: " + price);
        }
    }
}
