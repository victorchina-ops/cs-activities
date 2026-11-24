using System;

class Program
{
    static void Main()
    {
        int age = int.Parse(Console.ReadLine());
        if (age < 0 || age > 120)
        {
            Console.WriteLine("גיל לא תקין");
        }
        else
        {
            int price = 25;
            if (age < 3)
            {
                price = 0;
            }
            else if (age < 18)
            {
                price = 30;
            }
            else if (age < 65)
            {
                price = 55;
            }
            Console.WriteLine("מחיר: " + price);
        }
    }
}